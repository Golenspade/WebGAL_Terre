import { t } from '@lingui/macro';
import type { ListProjectResourcesResponse } from '@/api/agentClient';
import styles from './resourcesList.module.scss';

interface ResourcesListProps {
  resources: ListProjectResourcesResponse;
}

export default function ResourcesList({ resources }: ResourcesListProps) {
  const sections = [
    { key: 'backgrounds', label: t`背景`, items: resources.backgrounds },
    { key: 'figures', label: t`立绘`, items: resources.figures },
    { key: 'bgm', label: t`BGM`, items: resources.bgm },
    { key: 'vocals', label: t`语音`, items: resources.vocals },
    { key: 'scenes', label: t`场景`, items: resources.scenes },
  ];

  return (
    <div className={styles.resourcesList}>
      <h3>{t`项目资源`}</h3>

      {sections.map((section) => (
        <div key={section.key} className={styles.section}>
          <h4 className={styles.sectionTitle}>
            {section.label} ({section.items.length})
          </h4>
          {section.items.length === 0 ? (
            <p className={styles.empty}>{t`无`}</p>
          ) : (
            <ul className={styles.itemList}>
              {section.items.map((item, index) => (
                <li key={index} className={styles.item}>
                  {item}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

