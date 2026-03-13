/**
 * @creatorweave/ui - CreatorWeave Brand Components
 *
 * Public API: Only brand components are exposed.
 * Internal shadcn/ui components are not exported.
 */

// Styles
import './styles/globals.css'

// Utils
export { cn } from './lib/utils'

// Types
export * from './types/z-index'

// ========== Brand Components (Public API) ==========
export * from './components/brand'

// ========== Internal: shadcn/ui (NOT EXPORTED) ==========
// The following components are used internally by brand components
// but are not part of the public API:
// - Button, Input, Label, Textarea, Checkbox, Switch, RadioGroup, Select
// - Card, Separator, Tabs, Accordion, Collapsible
// - Dialog, Sheet, Popover, Alert, Progress, Skeleton, Badge, Avatar
// - Toaster, toast
// - ContextMenu, NavigationMenu, Tooltip, HoverCard
//
// If you need these base components, use shadcn/ui directly or
// consume them through our Brand components.

// DropdownMenu - exported for project management features
export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuRadioGroup,
} from './components/ui/dropdown-menu'

// Tooltip - exported for app toolbar actions
export {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from './components/ui/tooltip'
