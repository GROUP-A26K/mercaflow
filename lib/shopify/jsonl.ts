import "server-only";

// Parsing du JSONL renvoyé par une Bulk Operation Shopify (MER-26).
//
// Une Bulk Operation (`groupObjects: false`) produit un fichier JSONL : une ligne =
// un objet JSON. Les objets enfants (variants, metafields…) portent un `__parentId`
// pointant vers l'`id` de leur parent ; les objets racine (produits) n'en ont pas.
//
// Deux usages :
//   - `streamJsonlNodes` : lit le flux ligne par ligne SANS tout charger en RAM
//     (le catalogue peut peser plusieurs centaines de Mo) → l'appelant écrit les
//     `raw_records` au fil de l'eau.
//   - `reconstructTree` : reconstitue l'arbre produit→variants/metafields en mémoire
//     (utilitaire pour la normalisation, opère par produit, pas sur tout le fichier).

export interface BulkNode {
  id: string;
  __parentId?: string;
  [key: string]: unknown;
}

export interface TreeNode extends BulkNode {
  __children: TreeNode[];
}

/** Parse une ligne JSONL en nœud ; exige un champ `id` (invariant Shopify bulk). */
export function parseJsonlLine(line: string): BulkNode {
  const parsed: unknown = JSON.parse(line);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as { id?: unknown }).id !== "string"
  ) {
    throw new Error("Nœud JSONL invalide : champ `id` (string) manquant");
  }
  return parsed as BulkNode;
}

/**
 * Découpe un flux de chunks texte en nœuds JSONL, un par un. Robuste aux chunks qui
 * coupent une ligne en deux (on bufferise jusqu'au prochain `\n`). Les lignes vides
 * (fin de fichier, séparateurs) sont ignorées.
 */
export async function* streamJsonlNodes(
  chunks: AsyncIterable<string>,
): AsyncIterable<BulkNode> {
  let buffer = "";
  let lineNumber = 0;

  const flushLine = (raw: string): BulkNode | null => {
    const line = raw.trim();
    if (line === "") return null;
    try {
      return parseJsonlLine(line);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "erreur inconnue";
      throw new Error(`JSONL invalide à la ligne ${lineNumber} : ${message}`);
    }
  };

  for await (const chunk of chunks) {
    buffer += chunk;
    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const raw = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      lineNumber += 1;
      const node = flushLine(raw);
      if (node) yield node;
      newlineIndex = buffer.indexOf("\n");
    }
  }

  // Dernière ligne sans `\n` final.
  lineNumber += 1;
  const node = flushLine(buffer);
  if (node) yield node;
}

/** Collecte tout un flux JSONL en tableau (tests / petits volumes uniquement). */
export async function collectJsonlStream(
  chunks: AsyncIterable<string>,
): Promise<BulkNode[]> {
  const nodes: BulkNode[] = [];
  for await (const node of streamJsonlNodes(chunks)) {
    nodes.push(node);
  }
  return nodes;
}

/**
 * Reconstitue l'arbre depuis une liste plate de nœuds via `__parentId`. Deux passes
 * (indexation puis liaison) → insensible à l'ordre d'apparition. Un nœud dont le parent
 * est absent du lot est traité comme une racine (orphelin). L'ordre d'insertion des
 * enfants suit l'ordre du JSONL.
 */
export function reconstructTree(nodes: readonly BulkNode[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  for (const node of nodes) {
    byId.set(node.id, { ...node, __children: [] });
  }

  const roots: TreeNode[] = [];
  for (const node of nodes) {
    const tree = byId.get(node.id);
    if (!tree) continue;
    const parent =
      node.__parentId != null ? byId.get(node.__parentId) : undefined;
    if (parent) {
      parent.__children.push(tree);
    } else {
      roots.push(tree);
    }
  }
  return roots;
}
