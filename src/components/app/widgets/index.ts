/**
 * Reusable domain widgets (pickers, sheets, evidence, small badges) – import from "@/components/app/widgets".
 * All components are client components; the sheets/feedback/photos need <SessionProvider> + <DataProvider>.
 */
export { ClassPicker, type ClassPickerProps } from "./class-picker";
export { ClassChips, type ClassChipsProps } from "./class-chips";
export { ErrorPicker, type ErrorPickerProps } from "./error-picker";
export { StudentPicker, type StudentPickerProps } from "./student-picker";
export { StudentHistorySheet, type StudentHistorySheetProps } from "./student-history-sheet";
export { IncidentDetailSheet, incidentEditHref, type IncidentDetailSheetProps } from "./incident-detail-sheet";
export { RemediationForm, RemediationSection, RemediationView, type RemediationFormProps, type RemediationSectionProps } from "./incident-remediation";
export { EvidenceGallery, type EvidenceGalleryProps } from "./evidence-gallery";
export { EvidenceImage, EvidenceImageView, type EvidenceImageProps } from "./evidence-image";
export { PhotoCapture, type PhotoCaptureProps } from "./photo-capture";
export { RagLegend, ragRuleText, type RagLegendProps } from "./rag-legend";
export { FormulaText, type FormulaTextProps } from "./formula-text";
export { EmptyDataHint, type EmptyDataHintProps } from "./empty-data-hint";
export {
  ScopeBadge,
  PeriodBadge,
  PenaltyPill,
  StudentStatusBadge,
  StudentAlertBadge,
  type ScopeBadgeProps,
  type PeriodBadgeProps,
  type PenaltyPillProps,
  type StudentAlertBadgeProps,
} from "./badges";
export { useEvidenceUrl, useRetained, useNow, type EvidenceUrlState } from "./hooks";

/* Pure helpers (also usable on the server / in tests). */
export { classOptions, pickClasses, gradesOf, gradeLabel, classDescription, compareClasses, type ClassFilter } from "./lib/class-options";
export { errorOptions, penaltyLabel, unitExplanation, RECENT_GROUP, type ErrorOptionsArgs } from "./lib/error-options";
export { readRecentErrors, rememberRecentError, RECENT_ERRORS_KEY } from "./lib/recent-errors";
export {
  activeStudentsOfClass,
  searchStudents,
  frequentStudents,
  compareStudentsByGivenName,
  selectedStudents,
  type FrequentStudent,
  type SelectedStudent,
  type SelectedStudentState,
} from "./lib/student-options";
export { pointsFormula, formulaInputOf, type PointsFormula, type FormulaInput, type FormulaIncident } from "./lib/points-formula";
export {
  STUDENT_ALERT_LABELS,
  studentAlertDescription,
  studentErrorBreakdown,
  studentPointsOf,
  summarizeHistory,
  buildStudentHistoryText,
  type StudentAlert,
  type StudentErrorRow,
} from "./lib/student-summary";
export {
  canEditIncident,
  canDeleteIncident,
  canRestoreIncident,
  canGiveFeedback,
  canRemediate,
  feedbackRights,
  isIncidentRedacted,
  editWindowRemainingMs,
  formatRemaining,
  type FeedbackRights,
} from "./lib/incident-access";
export {
  REMEDIATION_MAX,
  REMEDIATION_PHRASES,
  appendPhrase,
  codeOfIncidentId,
  feedbackChanges,
  notDuplicateCodes,
  remediationMeta,
  type FeedbackDraft,
} from "./lib/remediation";
export { safeExternalUrl, displayUrl } from "./lib/urls";
export { copyText } from "./lib/clipboard";
export { copyWithFallback, ManualCopyHost, type CopyWithFallbackOptions } from "./manual-copy";
export { photoSaveBlocker, summarizePhotoUploads, type PhotoUploadSummary } from "./lib/photo-uploads";
