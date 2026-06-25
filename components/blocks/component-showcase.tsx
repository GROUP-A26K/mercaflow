"use client";

import {
  IconBell,
  IconCreditCard,
  IconInfoCircle,
  IconLogout,
  IconSettings,
  IconSparkles,
  IconUser,
} from "@tabler/icons-react";
import { toast } from "sonner";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

const skus = [
  { sku: "SKU-1042", name: "Trail Runner X", score: 92, status: "Recommandé" },
  { sku: "SKU-2271", name: "Serum Éclat", score: 64, status: "À corriger" },
  { sku: "SKU-3390", name: "Veste Alpine", score: 31, status: "Invisible" },
];

export function ComponentShowcase() {
  return (
    <TooltipProvider>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
        {/* Boutons */}
        <Card>
          <CardHeader>
            <CardTitle>Boutons</CardTitle>
            <CardDescription>Variantes & tailles</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button>Default</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="link">Link</Button>
            <Button size="sm">Small</Button>
            <Button size="lg">Large</Button>
            <Button size="icon" aria-label="Réglages">
              <IconSettings />
            </Button>
          </CardContent>
        </Card>

        {/* Badges */}
        <Card>
          <CardHeader>
            <CardTitle>Badges</CardTitle>
            <CardDescription>États & étiquettes</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Badge>Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="destructive">Invisible</Badge>
            <Badge variant="outline">Outline</Badge>
            <Badge>
              <IconSparkles className="size-3" />
              Agent-ready
            </Badge>
          </CardContent>
        </Card>

        {/* Contrôles de formulaire */}
        <Card>
          <CardHeader>
            <CardTitle>Champs</CardTitle>
            <CardDescription>Inputs & sélecteurs</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="sku">Référence SKU</Label>
              <Input id="sku" placeholder="SKU-0001" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="cat">Catégorie</Label>
              <Select>
                <SelectTrigger id="cat">
                  <SelectValue placeholder="Choisir…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="running">Running</SelectItem>
                  <SelectItem value="skincare">Skincare</SelectItem>
                  <SelectItem value="outdoor">Outdoor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" placeholder="Description produit…" />
            </div>
          </CardContent>
        </Card>

        {/* Sélections */}
        <Card>
          <CardHeader>
            <CardTitle>Sélections</CardTitle>
            <CardDescription>Checkbox · radio · switch</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Checkbox id="terms" defaultChecked />
              <Label htmlFor="terms">Synchroniser le catalogue Shopify</Label>
            </div>
            <RadioGroup defaultValue="weekly" className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="daily" id="daily" />
                <Label htmlFor="daily">Audit quotidien</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="weekly" id="weekly" />
                <Label htmlFor="weekly">Audit hebdomadaire</Label>
              </div>
            </RadioGroup>
            <Separator />
            <div className="flex items-center justify-between">
              <Label htmlFor="alerts">Alertes de ranking</Label>
              <Switch id="alerts" defaultChecked />
            </div>
          </CardContent>
        </Card>

        {/* Sliders & progression */}
        <Card>
          <CardHeader>
            <CardTitle>Scores</CardTitle>
            <CardDescription>Slider & progression</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <Label>Seuil de recommandation</Label>
              <Slider defaultValue={[70]} max={100} step={1} />
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Readiness moyen</span>
                <span className="font-medium tabular-nums">62%</span>
              </div>
              <Progress value={62} />
            </div>
          </CardContent>
        </Card>

        {/* Onglets */}
        <Card>
          <CardHeader>
            <CardTitle>Onglets</CardTitle>
            <CardDescription>Navigation par vue</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="audit">
              <TabsList>
                <TabsTrigger value="audit">Audit</TabsTrigger>
                <TabsTrigger value="score">Score</TabsTrigger>
                <TabsTrigger value="fix">Fix</TabsTrigger>
              </TabsList>
              <TabsContent value="audit" className="pt-3 text-muted-foreground">
                Visibilité par SKU sur ChatGPT, Perplexity, Gemini.
              </TabsContent>
              <TabsContent value="score" className="pt-3 text-muted-foreground">
                7 dimensions du Product Understanding Score.
              </TabsContent>
              <TabsContent value="fix" className="pt-3 text-muted-foreground">
                Corrections prêtes à pousser dans Shopify.
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Accordéon */}
        <Card>
          <CardHeader>
            <CardTitle>Accordéon</CardTitle>
            <CardDescription>FAQ repliable</CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible defaultValue="q1">
              <AccordionItem value="q1">
                <AccordionTrigger>Qu&apos;est-ce qu&apos;un audit ?</AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  Une analyse SKU-level de votre visibilité dans les moteurs IA.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="q2">
                <AccordionTrigger>Combien de temps ?</AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  Livré en 72 heures.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>

        {/* Alertes */}
        <Card>
          <CardHeader>
            <CardTitle>Alertes</CardTitle>
            <CardDescription>Messages contextuels</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Alert>
              <IconInfoCircle />
              <AlertTitle>Catalogue synchronisé</AlertTitle>
              <AlertDescription>
                1 248 SKU importés depuis Shopify.
              </AlertDescription>
            </Alert>
            <Alert variant="destructive">
              <IconBell />
              <AlertTitle>Perte de ranking</AlertTitle>
              <AlertDescription>3 produits ont chuté cette semaine.</AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        {/* Overlays */}
        <Card>
          <CardHeader>
            <CardTitle>Overlays</CardTitle>
            <CardDescription>Dialog · menu · popover · toast</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline">Dialog</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Lancer un audit</DialogTitle>
                  <DialogDescription>
                    Analyse SKU-level sur les moteurs IA, livrée en 72h.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline">Annuler</Button>
                  </DialogClose>
                  <Button>Confirmer</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">Menu</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>Mon compte</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <IconUser />
                  Profil
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <IconCreditCard />
                  Facturation
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive">
                  <IconLogout />
                  Déconnexion
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline">Popover</Button>
              </PopoverTrigger>
              <PopoverContent className="text-sm text-muted-foreground">
                Détail du score de recommandation pour ce SKU.
              </PopoverContent>
            </Popover>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline">Tooltip</Button>
              </TooltipTrigger>
              <TooltipContent>Probabilité d&apos;être recommandé</TooltipContent>
            </Tooltip>

            <Button onClick={() => toast.success("Audit lancé", { description: "Résultats sous 72h." })}>
              Toast
            </Button>
          </CardContent>
        </Card>

        {/* Avatars */}
        <Card>
          <CardHeader>
            <CardTitle>Avatars</CardTitle>
            <CardDescription>Identité & équipe</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-3">
            <Avatar>
              <AvatarImage src="https://i.pravatar.cc/80?img=12" alt="" />
              <AvatarFallback>JB</AvatarFallback>
            </Avatar>
            <Avatar>
              <AvatarFallback>MF</AvatarFallback>
            </Avatar>
            <div className="flex flex-col">
              <span className="text-sm font-medium">Jean-Baptiste</span>
              <span className="text-xs text-muted-foreground">Fondateur</span>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Tableau</CardTitle>
            <CardDescription>Aperçu SKU</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Produit</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                  <TableHead className="text-right">Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {skus.map((row) => (
                  <TableRow key={row.sku}>
                    <TableCell className="font-mono text-xs">{row.sku}</TableCell>
                    <TableCell>{row.name}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.score}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge
                        variant={
                          row.score >= 80
                            ? "default"
                            : row.score >= 50
                              ? "secondary"
                              : "destructive"
                        }
                      >
                        {row.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Skeleton */}
        <Card>
          <CardHeader>
            <CardTitle>Skeleton</CardTitle>
            <CardDescription>États de chargement</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-4">
            <Skeleton className="size-12 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </CardContent>
          <CardFooter>
            <Skeleton className="h-9 w-28" />
          </CardFooter>
        </Card>
      </div>

      <Toaster richColors position="top-center" />
    </TooltipProvider>
  );
}
