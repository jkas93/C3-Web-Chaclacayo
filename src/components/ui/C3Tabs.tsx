import { TabGroup, TabList, Tab, TabPanels, TabPanel } from '@headlessui/react';
import type { ReactNode } from 'react';

export interface C3TabItem {
  key: string;
  label: string;
  count?: number;
  panel?: ReactNode;
}

interface C3TabsProps {
  tabs: C3TabItem[];
  selectedIndex?: number;
  onChange?: (index: number) => void;
  /** Si se usa como filtro sin paneles de contenido */
  filterMode?: boolean;
}

/**
 * C3Tabs — Sistema de tabs construido sobre Headless UI TabGroup.
 * - Keyboard navigation (flechas, Home, End)
 * - data-selected para estilo activo
 * - Badge de conteo por tab
 * - filterMode: solo renderiza tabs sin TabPanels
 */
export const C3Tabs = ({ tabs, selectedIndex, onChange, filterMode = false }: C3TabsProps) => {
  return (
    <TabGroup selectedIndex={selectedIndex} onChange={onChange} className="c3-tabs">
      <TabList className="c3-tabs-list" aria-label="Filtros de estado">
        {tabs.map(tab => (
          <Tab key={tab.key} className="c3-tabs-tab">
            {tab.label}
            {tab.count != null && (
              <span className="c3-tabs-badge" aria-label={`${tab.count} elementos`}>
                {tab.count}
              </span>
            )}
          </Tab>
        ))}
      </TabList>

      {!filterMode && (
        <TabPanels className="c3-tabs-panels">
          {tabs.map(tab => (
            <TabPanel key={tab.key} className="c3-tabs-panel">
              {tab.panel}
            </TabPanel>
          ))}
        </TabPanels>
      )}
    </TabGroup>
  );
};
