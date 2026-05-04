export interface UiaBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type UiaRole = 'Button' | 'Edit' | 'TabItem' | 'List' | 'ListItem' | 'Document' | 'Text' | 'Pane' | 'Window';

export interface UiaElement {
  role: UiaRole;
  name: string;
  automationId: string;
  boundingRectangle: UiaBox;
  hasKeyboardFocus: boolean;
}

export interface UiaFindSpec {
  role: UiaRole;
  name: string | RegExp;
  scope?: 'descendants' | 'children';
}

export interface UiaHealthResult {
  enabled: boolean;
  nodeCount: number;
}
