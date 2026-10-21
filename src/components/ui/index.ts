/**
 * NSHM UI kit – import from "@/components/ui".
 * Tokens live in src/app/globals.css (@theme). See /kit (dev only) for a live showcase.
 */
export { cn, type ClassValue } from "./cn";
export { TONES, toneHex, toneSoft, toneSolid, toneTile, toneFill, toneTrack, toneDot, toneOutline, type Tone } from "./tones";
export { BREAKPOINTS, useMediaQuery, useIsMobile, useDebouncedValue, useLatest } from "./hooks";
export { foldVN, matchesFolded, buildSearchIndex, searchOptions, groupOptions, type SearchableOption } from "./search";

export { Button, IconButton, buttonClasses, type ButtonProps, type IconButtonProps, type ButtonVariant, type ButtonSize, type ButtonClassOptions } from "./button";
export { Card, CardHeader, CardBody, CardFooter, type CardProps, type CardHeaderProps } from "./card";
export { KpiCard, type KpiCardProps, type KpiDelta } from "./kpi-card";
export { StatTrend, type StatTrendProps } from "./stat-trend";
export { Badge, Pill, type BadgeProps, type PillProps } from "./badge";
export {
  RagBadge,
  Top90Badge,
  DataCheckBadge,
  StatusBadge,
  PriorityBadge,
  type RagBadgeProps,
  type Top90BadgeProps,
  type DataCheckBadgeProps,
  type StatusBadgeProps,
  type AnyStatus,
} from "./status-badges";
export { PageHeader, Section, BrandIconTile, StarPoint, type PageHeaderProps, type SectionProps, type Breadcrumb } from "./page-header";
export { Tabs, TabsList, TabsTrigger, TabsContent, type TabsProps, type TabsListProps, type TabsTriggerProps } from "./tabs";
export { SegmentedControl, type SegmentedControlProps, type SegmentOption } from "./segmented-control";

export { Field, useFieldControl, type FieldProps } from "./field";
export { controlBase, controlHeight } from "./control-styles";
export { Input, Textarea, DateInput, type InputProps, type TextareaProps, type DateInputProps } from "./input";
export { SearchInput, type SearchInputProps } from "./search-input";
export { Select, type SelectProps, type SelectOption } from "./select";
export { Combobox, type ComboboxProps, type ComboOption, type OptionRenderState } from "./combobox";
export { MultiCombobox, type MultiComboboxProps } from "./multi-combobox";
export { NumberStepper, type NumberStepperProps } from "./number-stepper";
export { clampStep } from "./math";
export { Switch, Checkbox, type SwitchProps, type CheckboxProps } from "./toggles";

export { Dialog, DialogClose, type DialogProps } from "./dialog";
export { Sheet, type SheetProps, type SheetSide } from "./sheet";
export { ConfirmDialog, type ConfirmDialogProps } from "./confirm-dialog";
export { Tooltip, type TooltipProps } from "./tooltip";

export { DataTable, type DataTableColumn, type DataTableProps } from "./data-table";
export { compareSortValues, sortRows, type SortDir, type SortState, type SortValue } from "./table-sort";
export { EmptyState, ErrorState, type EmptyStateProps, type ErrorStateProps } from "./states";
export { Skeleton, SkeletonText, SkeletonCard, type SkeletonProps } from "./skeleton";
export { Spinner, type SpinnerProps } from "./spinner";
export { Avatar, initialsOf, avatarColorIndex, type AvatarProps } from "./avatar";
export { ProgressBar, type ProgressBarProps } from "./progress-bar";
export { Toaster, toast } from "./toaster";
export { formatNumberVN, formatPercentVN, formatSignedVN, formatCompactVN } from "./format";
