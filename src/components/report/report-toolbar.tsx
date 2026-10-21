"use client";
/** Controls of the report page (hidden when printing): period (tuần | tháng), recipient, detail toggle, actions. */
import { useMemo } from "react";
import { FileSpreadsheet, Printer } from "lucide-react";
import { Button, Card, Field, SegmentedControl, Select, Switch } from "@/components/ui";
import { PeriodPicker } from "@/components/app/shell/period-picker";
import type { PeriodOptionLists } from "@/components/app/shell/period-utils";
import type { Period } from "@/lib/types";
import { REPORT_MODES, type RecipientOption, type ReportMode } from "./lib/report-model";

export interface ReportToolbarProps {
  period: Period;
  periodOptions: PeriodOptionLists;
  onMode: (mode: ReportMode) => void;
  onPeriodKey: (key: string) => void;
  recipients: readonly RecipientOption[];
  recipientKey: string;
  onRecipient: (key: string) => void;
  detail: boolean;
  onDetail: (on: boolean) => void;
  onPrint: () => void;
  /** Undefined hides "Xuất Excel chi tiết" (no excel.export). */
  onExport?: () => void;
  exporting?: boolean;
  /** Number of incidents of the scope (Excel disabled at 0). */
  rows: number;
}

export function ReportToolbar(props: ReportToolbarProps) {
  const { period, recipients } = props;
  const mode: ReportMode = period.mode === "month" ? "month" : "week";
  const options = useMemo(() => recipients.map((r) => ({ value: r.key, label: r.label, group: r.group })), [recipients]);

  return (
    <Card padding="sm" data-print-hide>
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
        <Field label="Kỳ báo cáo" className="min-w-0 lg:w-[460px]">
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
            <SegmentedControl<ReportMode> size="sm" ariaLabel="Báo cáo theo tuần hoặc tháng" options={[...REPORT_MODES]} value={mode} onChange={props.onMode} />
            <PeriodPicker mode={mode} value={period.key} options={props.periodOptions} onChange={props.onPeriodKey} className="min-w-0 flex-1" />
          </div>
        </Field>
        <Field label="Người nhận" className="min-w-0 lg:w-[260px]">
          <Select<string>
            options={options}
            value={props.recipientKey}
            onChange={(v) => v && props.onRecipient(v)}
            disabled={options.length <= 1}
            aria-label="Người nhận báo cáo"
          />
        </Field>
        <div className="flex min-h-11 items-center lg:pb-1">
          <Switch checked={props.detail} onChange={props.onDetail} label="Kèm bảng chi tiết" size="sm" />
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
          <Button icon={Printer} onClick={props.onPrint}>
            In / Lưu PDF
          </Button>
          {props.onExport ? (
            <Button variant="secondary" icon={FileSpreadsheet} loading={props.exporting} disabled={props.rows === 0} onClick={props.onExport}>
              Xuất Excel chi tiết
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
