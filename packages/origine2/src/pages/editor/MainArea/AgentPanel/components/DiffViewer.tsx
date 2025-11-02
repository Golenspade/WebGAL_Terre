import { t } from '@lingui/macro';
import type { Diff } from '@/api/agentClient';
import styles from './diffViewer.module.scss';

interface DiffViewerProps {
  diff: Diff;
}

export default function DiffViewer({ diff }: DiffViewerProps) {
  if (!diff.hunks || diff.hunks.length === 0) {
    return (
      <div className={styles.noDiff}>
        <p>{t`无变更`}</p>
      </div>
    );
  }

  return (
    <div className={styles.diffViewer}>
      {diff.hunks.map((hunk, index) => (
        <div key={index} className={styles.hunk}>
          <div className={styles.hunkHeader}>
            <span className={styles.hunkInfo}>
              @@ -{hunk.startOld},{hunk.lenOld} +{hunk.startNew},{hunk.lenNew} @@
            </span>
          </div>

          <div className={styles.hunkContent}>
            {/* 显示删除的行 */}
            {hunk.linesOld.map((line, lineIndex) => (
              <div key={`old-${lineIndex}`} className={styles.lineRemoved}>
                <span className={styles.lineNumber}>-{hunk.startOld + lineIndex}</span>
                <span className={styles.lineContent}>- {line}</span>
              </div>
            ))}

            {/* 显示新增的行 */}
            {hunk.linesNew.map((line, lineIndex) => (
              <div key={`new-${lineIndex}`} className={styles.lineAdded}>
                <span className={styles.lineNumber}>+{hunk.startNew + lineIndex}</span>
                <span className={styles.lineContent}>+ {line}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

