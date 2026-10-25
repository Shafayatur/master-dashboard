import { FileSpreadsheet, FileText } from 'lucide-react';
import { PrintButton } from '@/components/dashboard/print-button';
import { cn } from '@/components/ui/cn';

interface Props {
  csvHref?: string;
  xlsxHref?: string;
}

const BASE = 'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors';
const GREEN = 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 hover:text-emerald-800 dark:text-emerald-300 dark:hover:text-emerald-200';
const BLUE = 'border-blue-500/30 bg-blue-500/10 text-blue-700 hover:bg-blue-500/20 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200';
const RED = 'border-rose-500/30 bg-rose-500/10 text-rose-700 hover:bg-rose-500/20 hover:text-rose-800 dark:text-rose-300 dark:hover:text-rose-200';

/** CSV (green), Excel (blue) and PDF (red) buttons. A button without a link is hidden; PDF prints the page. */
export function ExportBar({ csvHref, xlsxHref }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      {csvHref && (
        <a href={csvHref} download className={cn(BASE, GREEN)}>
          <FileText className="h-3.5 w-3.5" aria-hidden />
          CSV
        </a>
      )}
      {xlsxHref && (
        <a href={xlsxHref} download className={cn(BASE, BLUE)}>
          <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden />
          Excel
        </a>
      )}
      <PrintButton label="PDF" className={cn(BASE, RED)} />
    </div>
  );
}
