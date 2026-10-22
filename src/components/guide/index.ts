/**
 * User guide (/huong-dan) – import from "@/components/guide".
 * Content: ./content (GUIDE: GuideContent, schema in ./types). Renderer: GuideRenderer (content) / GuideView (any content).
 */
export type { GuideBlock, GuideContent, GuideFaq, GuideIcon, GuideQuickStart, GuideRole, GuideSection } from "./types";
export { GuideRenderer } from "./guide-renderer";
export { GuideView, buildGuideToc, type GuideViewProps } from "./guide-view";
export { GuideBlockView, GuideTable, Callout, StepList, type GuideTableProps } from "./guide-blocks";
export { GuideDemo, type GuideDemoKind } from "./guide-demos";
export { InlineText, type InlineTextProps, type InlineTone } from "./inline-text";
export { parseInline, inlineToPlain, isInternalHref, type InlineNode } from "./inline";
export { buildGuideIndex, searchGuide, sectionSearchText, blockText, faqSearchText, guideTextMatches, queryTokens, type GuideSearchIndex, type GuideSearchResult } from "./search";
export { GUIDE_ICONS, guideIcon } from "./guide-icons";
export {
  GUIDE_GROUP_ORDER,
  GUIDE_GROUP_LABELS,
  GUIDE_ROLES,
  GUIDE_ROLE_LABELS,
  GUIDE_ANCHORS,
  groupSections,
  groupAnchor,
  quickStartAnchor,
  rolesText,
  sectionForRole,
  type GuideGroupId,
} from "./guide-meta";
