/**
 * @browser-fs-analyzer/ui - Shared UI components for browser-fs-analyzer
 * Based on shadcn/ui + custom design system
 */

// Styles
import './styles/globals.css'

// Utils
export { cn } from './lib/utils'

// ========== Form Components ==========
export { Button, buttonVariants } from './components/ui/button'

export { Input } from './components/ui/input'

export { Label } from './components/ui/label'

export { Textarea } from './components/ui/textarea'

export { Checkbox } from './components/ui/checkbox'

export { Switch } from './components/ui/switch'

export { RadioGroup, RadioGroupItem } from './components/ui/radio-group'

export {
  Select,
  SelectContent,
  SelectTrigger,
  SelectValue,
  SelectItem,
  SelectGroup,
  SelectLabel,
  SelectSeparator,
} from './components/ui/select'

// ========== Layout Components ==========
export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from './components/ui/card'

export { Separator } from './components/ui/separator'

export { Tabs, TabsList, TabsTrigger, TabsContent } from './components/ui/tabs'

export {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from './components/ui/accordion'

export {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from './components/ui/collapsible'

// ========== Dialog Components ==========
export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from './components/ui/dialog'

export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
} from './components/ui/sheet'

export {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverAnchor,
} from './components/ui/popover'

// ========== Feedback Components ==========
export { Toaster } from './components/ui/sonner'
export { toast } from 'sonner'

export { Alert, AlertTitle, AlertDescription } from './components/ui/alert'

export { Progress } from './components/ui/progress'

export { Skeleton } from './components/ui/skeleton'

export { Badge, badgeVariants } from './components/ui/badge'

export { Avatar, AvatarImage, AvatarFallback } from './components/ui/avatar'

// ========== Navigation Components ==========
export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
} from './components/ui/dropdown-menu'

export {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuCheckboxItem,
  ContextMenuRadioItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuGroup,
  ContextMenuPortal,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuRadioGroup,
} from './components/ui/context-menu'

export {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuIndicator,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  NavigationMenuViewport,
} from './components/ui/navigation-menu'

export {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from './components/ui/tooltip'

export {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
} from './components/ui/hover-card'
