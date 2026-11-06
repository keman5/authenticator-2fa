import type { ImportResult } from '../../lib/auth/types';
import { tr } from '../../lib/i18n/messages';

/** Localized explanation for an import that added no accounts. */
export function getImportFailureMessage(result: Pick<ImportResult, 'skipped' | 'errors'>): string {
  return result.errors[0] ?? tr(result.skipped > 0 ? 'importAllDuplicates' : 'importNoneFound');
}
