import { LitElement, html, css, TemplateResult } from 'lit';
import { customElement, property, state, query } from 'lit/decorators.js';
import { fireEvent, HomeAssistant } from 'custom-card-helpers';
import { TabsCardConfig, TabConfig, TabConfigSingleCard, TabConfigMultiCard } from './fork_u-bubble_simple_tabs';
import { LovelaceCardConfig } from 'custom-card-helpers/dist/types';
import * as yaml from 'js-yaml';

declare global {
  interface HTMLElementTagNameMap {
    'ha-yaml-editor': HaYamlEditor;
    'ha-icon-picker': HaIconPicker;
    'ha-textfield': HaTextField;
    'ha-expansion-panel': HaExpansionPanel;
    'ha-formfield': HaFormField;
    'ha-switch': HaSwitch;
    'hui-card-element-editor': HuiCardElementEditor;
    'ha-icon-button': HaIconButton;
  }
}

interface HaYamlEditor extends HTMLElement {
  defaultValue: string;
  value: string;
  hass: HomeAssistant;
  isValid: boolean;
  name: string;
}

interface HaIconPicker extends HTMLElement {
  value: string;
  label: string;
  name: string;
}

interface HaTextField extends HTMLElement {
  value: string;
  label: string;
  name: string;
}

interface HaExpansionPanel extends HTMLElement {
  header: string;
  expanded: boolean;
}

interface HaFormField extends HTMLElement {
  label: string;
}

interface HaSwitch extends HTMLElement {
  checked: boolean;
  disabled: boolean;
}

interface HuiCardElementEditor extends HTMLElement {
  hass?: HomeAssistant;
  value?: LovelaceCardConfig;
  lovelace?: any;
}

interface HaIconButton extends HTMLElement {
  path: string;
  label: string;
  disabled: boolean;
}


function stringifyCard(card: LovelaceCardConfig | string | undefined): string {
  if (!card) return '';

  let cardObject: LovelaceCardConfig;
  if (typeof card === 'string') {
    try {
      cardObject = yaml.load(card) as LovelaceCardConfig;
      if (typeof cardObject !== 'object' || cardObject === null) return card;
    } catch {
      return card;
    }
  } else {
    cardObject = card;
  }
  try {
    return yaml.dump(cardObject, { indent: 2, lineWidth: -1, noRefs: true, sortKeys: false, flowLevel: -1 }).trim();
  } catch (e) {
    console.error('Error dumping YAML:', e);
    return JSON.stringify(cardObject, null, 2);
  }
}

@customElement('fork-u-bubble-simple-tabs-editor')
export class ForkUBubbleSimpleTabsEditor extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;
  @property({ attribute: false }) public lovelace?: any;
  @state() private _config?: TabsCardConfig;
  @state() private _helpers?: any;
  @state() private _collapsedCards: Set<string> = new Set();
  @state() private _editorView: 'list' | 'edit' = 'list';
  @state() private _editingTabIndex = 0;
  @state() private _stackEditorReady = false;
  @query('#stack-editor-host') private _stackEditorHost?: HTMLDivElement;
  private _stackEditorEl: HTMLElement | null = null;
  private _stackEditorResolve?: (el: HTMLElement) => void;
  private _stackEditorPromise: Promise<HTMLElement> | null = null;
  private _stackEditorBoundTabIndex = -1;
  private _initialized = false;

  public setConfig(config: TabsCardConfig): void {
    this._config = config;
    this._initialized = true;
  }

  private _valueChanged(newConfig: TabsCardConfig): void {
    fireEvent(this, 'config-changed', { config: newConfig });
  }

  private _toggleHideInactive(ev: Event): void {
    if (!this._config) return;
    const target = ev.target as HaSwitch;
    this._valueChanged({ ...this._config, hide_inactive_tab_titles: target.checked });
  }

  private _toggleShowFade(ev: Event): void {
    if (!this._config) return;
    const target = ev.target as HaSwitch;
    this._valueChanged({ ...this._config, show_fade: target.checked });
  }

  private _toggleEnableSwipe(ev: Event): void {
    if (!this._config) return;
    const target = ev.target as HaSwitch;
    this._valueChanged({ ...this._config, enable_swipe: target.checked });
  }

  private _toggleHaptic(ev: Event): void {
    if (!this._config) return;
    const target = ev.target as HaSwitch;
    this._valueChanged({ ...this._config, haptic_feedback: target.checked });
  }

  private _handleSelectChange(ev: Event, field: string): void {
    if (!this._config) return;
    const target = ev.target as HTMLSelectElement;
    this._valueChanged({ ...this._config, [field]: target.value });
  }

  private _handleStylingCssChange(ev: Event): void {
    if (!this._config) return;
    const target = ev.target as HTMLTextAreaElement;
    this._valueChanged({ ...this._config, styling_css: target.value || undefined });
  }

  private _isMultiCardTab(tab: TabConfig): tab is TabConfigMultiCard {
    return 'cards' in tab && Array.isArray(tab.cards);
  }

  private _getTabCard(tab: TabConfig): LovelaceCardConfig | undefined {
    if ('cards' in tab && Array.isArray(tab.cards)) {
      return { type: 'vertical-stack', cards: tab.cards };
    }
    return tab.card;
  }

  private _handleTabChange(ev: Event, index: number): void {
    if (!this._config) return;
    const newTabs = [...this._config.tabs];
    const target = ev.target as (HaTextField | HaYamlEditor | HaIconPicker);
    const eventValue = (ev as CustomEvent).detail?.value ?? (target as { value: string }).value;
    const fieldName = target.name;

    let value: string | object;
    if (fieldName === 'card') {
      try {
        const indentedValue = String(eventValue).split('\n').map((line: string) => `  ${line}`).join('\n');
        value = yaml.load(indentedValue) as object;
        if (value === null || typeof value !== 'object') value = { type: '' };
      } catch {
        value = eventValue;
      }
    } else {
      value = eventValue;
    }
    newTabs[index] = { ...newTabs[index], [fieldName]: value };
    this._valueChanged({ ...this._config, tabs: newTabs });
  }

  private _addTab(): void {
    if (!this._config) return;
    const newTabs = [...(this._config.tabs || []), {
      title: 'New Tab',
      icon: 'mdi:new-box',
      card: { type: 'markdown', content: '## New Tab Content' }
    } as TabConfigSingleCard];
    this._valueChanged({ ...this._config, tabs: newTabs });
    this._editingTabIndex = newTabs.length - 1;
    this._editorView = 'edit';
  }

  private _removeTab(index: number): void {
    if (!this._config) return;
    const newTabs = this._config.tabs.filter((_, i) => i !== index);
    this._valueChanged({ ...this._config, tabs: newTabs });
    if (this._editorView === 'edit' && this._editingTabIndex >= newTabs.length) {
      this._editingTabIndex = Math.max(0, newTabs.length - 1);
      if (newTabs.length === 0) this._editorView = 'list';
    }
  }

  private _addCard(tabIndex: number): void {
    if (!this._config) return;
    const newTabs = [...this._config.tabs];
    const tab = newTabs[tabIndex];
    if ('card' in tab && tab.card) {
      const isContainer = tab.card.type === 'vertical-stack' || (tab.card.type === 'grid' && (tab.card as any).columns === 1);
      let initialCards: LovelaceCardConfig[] = [tab.card];
      if (isContainer && (tab.card as any).cards) initialCards = [...(tab.card as any).cards];
      const multiCardTab: TabConfigMultiCard = { ...tab, cards: [...initialCards, { type: 'markdown', content: 'New card content' }], card: undefined };
      delete (multiCardTab as any).card;
      newTabs[tabIndex] = multiCardTab;
    } else if ('cards' in tab) {
      newTabs[tabIndex] = { ...tab, cards: [...(tab.cards || []), { type: 'markdown', content: 'New card content' }] };
    }
    this._valueChanged({ ...this._config, tabs: newTabs });
  }

  private _removeCard(tabIndex: number, cardIndex: number): void {
    if (!this._config) return;
    const newTabs = [...this._config.tabs];
    const tab = newTabs[tabIndex];
    if ('cards' in tab && tab.cards) {
      const newCards = tab.cards.filter((_, i) => i !== cardIndex);
      if (newCards.length === 1) {
        newTabs[tabIndex] = { ...tab, card: newCards[0], cards: undefined } as TabConfigSingleCard;
        delete (newTabs[tabIndex] as any).cards;
      } else {
        newTabs[tabIndex] = { ...tab, cards: newCards };
      }
    }
    this._valueChanged({ ...this._config, tabs: newTabs });
  }

  private _moveCard(tabIndex: number, cardIndex: number, direction: 'up' | 'down'): void {
    if (!this._config) return;
    const newTabs = [...this._config.tabs];
    const tab = newTabs[tabIndex];
    if ('cards' in tab && tab.cards) {
      const newCards = [...tab.cards];
      const targetIndex = direction === 'up' ? cardIndex - 1 : cardIndex + 1;
      if (targetIndex >= 0 && targetIndex < newCards.length) {
        [newCards[cardIndex], newCards[targetIndex]] = [newCards[targetIndex], newCards[cardIndex]];
        newTabs[tabIndex] = { ...tab, cards: newCards };
        this._valueChanged({ ...this._config, tabs: newTabs });
      }
    }
  }

  private _toggleCardCollapse(tabIndex: number, cardIndex: number): void {
    const key = `${tabIndex}-${cardIndex}`;
    const newCollapsed = new Set(this._collapsedCards);
    if (newCollapsed.has(key)) newCollapsed.delete(key);
    else newCollapsed.add(key);
    this._collapsedCards = newCollapsed;
  }

  private _updateCard(tabIndex: number, cardIndex: number, cardConfig: LovelaceCardConfig): void {
    if (!this._config) return;
    const newTabs = [...this._config.tabs];
    const tab = newTabs[tabIndex];
    if ('cards' in tab && tab.cards) {
      const newCards = [...tab.cards];
      newCards[cardIndex] = cardConfig;
      newTabs[tabIndex] = { ...tab, cards: newCards };
      this._valueChanged({ ...this._config, tabs: newTabs });
    }
  }

  private _moveTab(index: number, direction: 'up' | 'down'): void {
    if (!this._config) return;
    const newTabs = [...this._config.tabs];
    const [tab] = newTabs.splice(index, 1);
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    newTabs.splice(newIndex, 0, tab);
    this._valueChanged({ ...this._config, tabs: newTabs });
    if (this._editorView === 'edit' && this._editingTabIndex === index) this._editingTabIndex = newIndex;
  }

  private _goToList(): void {
    this._editorView = 'list';
  }

  private _goToEditTab(index: number): void {
    this._editingTabIndex = index;
    this._editorView = 'edit';
  }

  private async _getStackConfigElement(): Promise<HTMLElement> {
    if (this._stackEditorPromise) return this._stackEditorPromise;
    this._stackEditorPromise = new Promise(async (resolve) => {
      let cls = customElements.get('hui-vertical-stack-card');
      if (!cls) {
        const helpers = await window.loadCardHelpers?.();
        if (helpers) helpers.createCardElement({ type: 'vertical-stack', cards: [] });
        await customElements.whenDefined('hui-vertical-stack-card');
        cls = customElements.get('hui-vertical-stack-card');
      }
      if (!cls) {
        console.error('[Fork U-Bubble Simple Tabs] Could not load hui-vertical-stack-card');
        resolve(document.createElement('div'));
        return;
      }
      const configEl = await (cls as any).getConfigElement?.();
      if (configEl?.setConfig) {
        const orig = configEl.setConfig.bind(configEl);
        configEl.setConfig = (cfg: any) =>
          orig({ type: 'vertical-stack', title: cfg?.title, cards: cfg?.cards ?? [] });
      }
      resolve(configEl || document.createElement('div'));
    });
    return this._stackEditorPromise;
  }

  private _tabCardsToStackCards(tab: TabConfig): LovelaceCardConfig[] {
    if ('cards' in tab && Array.isArray(tab.cards)) return [...tab.cards];
    if ('card' in tab && tab.card) return [tab.card];
    return [{ type: 'markdown', content: '## New tab' }];
  }

  protected async updated(changedProperties: Map<string, unknown>): Promise<void> {
    if (this._editorView === 'edit' && this._stackEditorHost && this._config) {
      const tab = this._config.tabs[this._editingTabIndex];
      if (!tab) return;
      if (this._stackEditorBoundTabIndex !== this._editingTabIndex || !this._stackEditorEl) {
        this._stackEditorBoundTabIndex = this._editingTabIndex;
        const el = await this._getStackConfigElement();
        this._stackEditorEl = el;
        while (this._stackEditorHost.firstChild) this._stackEditorHost.removeChild(this._stackEditorHost.firstChild);
        this._stackEditorHost.appendChild(el);
        const onConfigChanged = (ev: Event): void => {
          const detail = (ev as CustomEvent).detail;
          if (!detail?.config || !this._config) return;
          const cards: LovelaceCardConfig[] = detail.config.cards ?? [];
          const newTabs = [...this._config.tabs];
          const t = newTabs[this._editingTabIndex];
          const base = { title: t.title, icon: t.icon, id: t.id, badge: t.badge, conditions: t.conditions };
          if (cards.length === 1) {
            newTabs[this._editingTabIndex] = { ...base, card: cards[0] } as TabConfigSingleCard;
          } else {
            newTabs[this._editingTabIndex] = { ...base, cards } as TabConfigMultiCard;
          }
          this._valueChanged({ ...this._config, tabs: newTabs });
        };
        el.removeEventListener('config-changed', onConfigChanged);
        el.addEventListener('config-changed', onConfigChanged);
        (el as any).hass = this.hass;
        (el as any).lovelace = this.lovelace;
        (el as any).setConfig?.({ type: 'vertical-stack', cards: this._tabCardsToStackCards(tab) });
        this._stackEditorReady = true;
      } else {
        (this._stackEditorEl as any).setConfig?.({ type: 'vertical-stack', cards: this._tabCardsToStackCards(tab) });
      }
    } else {
      this._stackEditorBoundTabIndex = -1;
    }
  }

  protected render(): TemplateResult {
    if (!this.hass || !this._config) return html``;

    const tabs = this._config.tabs || [];
    const editingTab = tabs[this._editingTabIndex];

    return html`
      <div class="card-config">
        <!-- Visual tab strip: list of tabs + Add tab -->
        <div class="tab-strip">
          <div class="tab-strip-tabs">
            ${tabs.map((tab, i) => html`
              <button
                type="button"
                class="tab-strip-btn ${this._editorView === 'edit' && this._editingTabIndex === i ? 'active' : ''}"
                @click=${() => this._goToEditTab(i)}
              >
                ${i + 1}
              </button>
            `)}
            <button type="button" class="tab-strip-add" title="Add tab" @click=${this._addTab}>
              +
            </button>
          </div>
          ${this._editorView === 'edit' ? html`
            <button type="button" class="back-to-list" @click=${this._goToList}>
              <ha-icon icon="mdi:arrow-left"></ha-icon> Back to tabs list
            </button>
          ` : ''}
        </div>

        ${this._editorView === 'edit' && editingTab ? this._renderEditTab(this._editingTabIndex, editingTab) : html`
          <div class="global-options">
            <h3>Display Settings</h3>
            <ha-formfield label="Hide titles on inactive tabs">
              <ha-switch .checked=${this._config.hide_inactive_tab_titles || false} @change=${this._toggleHideInactive}></ha-switch>
            </ha-formfield>
            <br>
            <ha-formfield label="Show scroll fade">
              <ha-switch .checked=${this._config.show_fade ?? true} @change=${this._toggleShowFade}></ha-switch>
            </ha-formfield>
            <br><br>
            <label>Tab Position</label>
            <select .value=${this._config.tab_position || 'top'} @change=${(e: Event) => this._handleSelectChange(e, 'tab_position')} style="width: 100%; margin-top: 8px; padding: 8px;">
              <option value="top">Top</option>
              <option value="bottom">Bottom</option>
            </select>
            <select .value=${this._config.alignment || 'center'} @change=${(e: Event) => this._handleSelectChange(e, 'alignment')} style="width: 100%; margin-top: 8px; padding: 8px;">
              <option value="start">Start (Left)</option>
              <option value="center">Center</option>
              <option value="end">End (Right)</option>
            </select>
            <h3 style="margin-top: 16px;">Behavior Settings</h3>
            <ha-formfield label="Enable swipe gestures">
              <ha-switch .checked=${this._config.enable_swipe ?? true} @change=${this._toggleEnableSwipe}></ha-switch>
            </ha-formfield>
            <ha-formfield label="Haptic feedback">
              <ha-switch .checked=${this._config.haptic_feedback || false} @change=${this._toggleHaptic}></ha-switch>
            </ha-formfield>
            <br><br>
            <label>Remember last tab</label>
            <select .value=${String(this._config.remember_tab || 'false')} @change=${(e: Event) => this._handleSelectChange(e, 'remember_tab')} style="width: 100%; margin-top: 8px; padding: 8px;">
              <option value="false">Off</option>
              <option value="true">On</option>
              <option value="per_device">Per Device</option>
            </select>
            <h3 style="margin-top: 16px;">Styling CSS</h3>
            <p class="field-desc">Custom CSS for this card (no card_mod needed). Applied to the card container.</p>
            <textarea
              class="styling-css"
              .value=${this._config.styling_css || ''}
              @input=${this._handleStylingCssChange}
              placeholder="e.g. .card-container { border-radius: 16px; }"
              rows="4"
            ></textarea>
          </div>
          <div class="tabs-list">
            ${tabs.map((tab, index) => html`
              <ha-expansion-panel>
                <div slot="header" class="summary-header">
                  <div class="reorder-controls">
                    <ha-icon class="reorder-btn" icon="mdi:arrow-up" title="Move Up" .disabled=${index === 0} @click=${(e: Event) => { e.stopPropagation(); this._moveTab(index, 'up'); }}></ha-icon>
                    <ha-icon class="reorder-btn" icon="mdi:arrow-down" title="Move Down" .disabled=${index === (tabs.length - 1)} @click=${(e: Event) => { e.stopPropagation(); this._moveTab(index, 'down'); }}></ha-icon>
                  </div>
                  <ha-textfield class="summary-title" .name=${'title'} .value=${tab.title || ''} placeholder="Tab Title" @input=${(e: Event) => this._handleTabChange(e, index)} @click=${(e: Event) => e.stopPropagation()} @keydown=${(e: KeyboardEvent) => e.stopPropagation()}></ha-textfield>
                  <ha-icon class="remove-icon" icon="mdi:delete" title="Remove Tab" @click=${(e: Event) => { e.stopPropagation(); this._removeTab(index); }}></ha-icon>
                </div>
                <div class="card-content">
                  <div class="tab-settings-row">
                    <ha-icon-picker .label=${'Icon'} .value=${tab.icon || ''} .name=${'icon'} @value-changed=${(e: Event) => this._handleTabChange(e, index)}></ha-icon-picker>
                    <ha-textfield .label=${'Tab ID (for deep linking)'} .value=${tab.id || ''} .name=${'id'} @input=${(e: Event) => this._handleTabChange(e, index)}></ha-textfield>
                  </div>
                  <ha-textfield .label=${'Badge Template (Jinja)'} .value=${tab.badge || ''} .name=${'badge'} placeholder="{{ is_state('light.kitchen', 'on') }}" @input=${(e: Event) => this._handleTabChange(e, index)}></ha-textfield>
                  ${this._isMultiCardTab(tab) ? this._renderMultiCardTab(index, tab) : this._renderSingleCardTab(index, tab)}
                </div>
              </ha-expansion-panel>
            `)}
          </div>
          <mwc-button @click=${this._addTab} raised class="add-btn">
            <ha-icon icon="mdi:plus" style="margin-right: 8px;"></ha-icon>
            Add Tab
          </mwc-button>
        `}

        <p class="help-text"><strong>Note:</strong> Advanced styling and logic can be configured via the YAML code editor. Use "Styling CSS" above for custom CSS without card_mod.</p>
      </div>
    `;
  }

  private _renderEditTab(index: number, tab: TabConfig): TemplateResult {
    return html`
      <div class="edit-tab-panel">
        <div class="global-options" style="margin-bottom: 16px;">
          <h3>Tab ${index + 1}</h3>
          <ha-textfield label="Title" .value=${tab.title || ''} .name=${'title'} @input=${(e: Event) => this._handleTabChange(e, index)} style="width: 100%;"></ha-textfield>
          <div class="tab-settings-row">
            <ha-icon-picker .label=${'Icon'} .value=${tab.icon || ''} .name=${'icon'} @value-changed=${(e: Event) => this._handleTabChange(e, index)}></ha-icon-picker>
            <ha-textfield .label=${'Tab ID (deep link)'} .value=${tab.id || ''} .name=${'id'} @input=${(e: Event) => this._handleTabChange(e, index)}></ha-textfield>
          </div>
          <ha-textfield .label=${'Badge (Jinja)'} .value=${tab.badge || ''} .name=${'badge'} @input=${(e: Event) => this._handleTabChange(e, index)}></ha-textfield>
        </div>
        <h3 style="margin: 16px 0 8px 0;">Cards (click + to add, scrollable list)</h3>
        <div id="stack-editor-host" class="stack-editor-host"></div>
      </div>
    `;
  }

  private _renderMultiCardTab(tabIndex: number, tab: TabConfigMultiCard): TemplateResult {
    return html`
      <h3 style="margin-top: 16px;">Tab Cards (${tab.cards.length})</h3>
      ${tab.cards.map((card, cardIndex) => {
        const isCollapsed = this._collapsedCards.has(`${tabIndex}-${cardIndex}`);
        return html`
          <div class="card-block">
            <div class="card-block-header" @click=${() => this._toggleCardCollapse(tabIndex, cardIndex)}>
              <div class="card-block-controls">
                ${tab.cards.length > 1 ? html`
                  <div @click=${(e: Event) => e.stopPropagation()}>
                    <ha-icon-button .label=${'Move Up'} .path=${'M7.41,15.41L12,10.83L16.59,15.41L18,14L12,8L6,14L7.41,15.41Z'} ?disabled=${cardIndex === 0} @click=${() => this._moveCard(tabIndex, cardIndex, 'up')}></ha-icon-button>
                    <ha-icon-button .label=${'Move Down'} .path=${'M7.41,8.59L12,13.17L16.59,8.59L18,10L12,16L6,10L7.41,8.59Z'} ?disabled=${cardIndex === tab.cards.length - 1} @click=${() => this._moveCard(tabIndex, cardIndex, 'down')}></ha-icon-button>
                  </div>
                ` : ''}
                <strong>Card ${cardIndex + 1}</strong>
                <span class="card-type-label">${card.type}</span>
              </div>
              <div>
                ${tab.cards.length > 1 ? html`
                  <ha-icon-button .label=${'Remove'} .path=${'M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z'} style="color: var(--error-color);" @click=${(e: Event) => { e.stopPropagation(); this._removeCard(tabIndex, cardIndex); }}></ha-icon-button>
                ` : ''}
                <ha-icon .icon=${isCollapsed ? 'mdi:chevron-right' : 'mdi:chevron-down'}></ha-icon>
              </div>
            </div>
            <ha-yaml-editor
              .hass=${this.hass}
              .name=${'card-' + cardIndex}
              .defaultValue=${stringifyCard(card)}
              style=${isCollapsed ? 'display: none;' : ''}
              @value-changed=${(e: Event) => {
                const detail = (e as CustomEvent).detail;
                if (detail?.value && detail.isValid !== false) this._updateCard(tabIndex, cardIndex, detail.value);
              }}
            ></ha-yaml-editor>
          </div>
        `;
      })}
      <button type="button" class="add-card-btn" @click=${() => this._addCard(tabIndex)}>+ Add Another Card</button>
    `;
  }

  private _renderSingleCardTab(tabIndex: number, tab: TabConfigSingleCard): TemplateResult {
    return html`
      <div style="margin-top: 16px;">
        <p>Card content:</p>
        <ha-yaml-editor
          .hass=${this.hass}
          .name=${'card'}
          .defaultValue=${stringifyCard(this._getTabCard(tab))}
          @value-changed=${(e: Event) => this._handleTabChange(e, tabIndex)}
        ></ha-yaml-editor>
        <button type="button" class="add-card-btn secondary" @click=${() => this._addCard(tabIndex)}>+ Add Another Card (Multi-Card)</button>
      </div>
    `;
  }

  static styles = css`
    .card-config { padding: 16px; }
    .tab-strip {
      margin-bottom: 16px;
      padding: 12px;
      background: var(--sidebar-background-color, rgba(0,0,0,0.05));
      border-radius: 8px;
      border: 1px solid var(--divider-color);
    }
    .tab-strip-tabs {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }
    .tab-strip-btn {
      min-width: 36px;
      height: 36px;
      padding: 0 10px;
      border-radius: 50%;
      border: 1px solid var(--divider-color);
      background: var(--card-background-color);
      color: var(--primary-text-color);
      cursor: pointer;
      font-weight: bold;
    }
    .tab-strip-btn.active {
      background: var(--primary-color);
      color: var(--primary-text-color);
      border-color: var(--primary-color);
    }
    .tab-strip-add {
      min-width: 36px;
      height: 36px;
      padding: 0;
      border-radius: 50%;
      border: 2px dashed var(--divider-color);
      background: transparent;
      color: var(--primary-color);
      cursor: pointer;
      font-size: 1.4em;
      line-height: 1;
    }
    .tab-strip-add:hover {
      border-color: var(--primary-color);
      background: var(--primary-color);
      color: var(--primary-text-color);
    }
    .back-to-list {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-top: 10px;
      padding: 8px 12px;
      background: var(--secondary-background-color);
      border: 1px solid var(--divider-color);
      border-radius: 8px;
      color: var(--primary-text-color);
      cursor: pointer;
      font-size: 14px;
    }
    .global-options {
      margin-bottom: 24px;
      padding: 8px;
      border: 1px solid var(--divider-color);
      border-radius: 4px;
    }
    .field-desc { font-size: 0.9em; color: var(--secondary-text-color); margin: 4px 0 8px 0; }
    .styling-css {
      width: 100%;
      box-sizing: border-box;
      padding: 8px;
      font-family: var(--code-font-family, monospace);
      font-size: 12px;
      border: 1px solid var(--divider-color);
      border-radius: 4px;
      background: var(--code-editor-background-color, var(--card-background-color));
      color: var(--primary-text-color);
      resize: vertical;
    }
    .tabs-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
    ha-expansion-panel {
      border-radius: 6px;
      --expansion-panel-content-padding: 0;
      background: var(--sidebar-background-color);
    }
    .help-text { font-size: 0.9em; color: var(--secondary-text-color); margin-top: 24px; }
    .summary-header { display: flex; align-items: center; width: 100%; }
    .summary-title { flex: 1; --mdc-text-field-fill-color: transparent; --text-field-border-width: 0px; }
    .remove-icon { color: var(--secondary-text-color); padding: 0 8px; }
    .add-btn { background: var(--accent-color); padding: 8px 16px 8px 8px; border-radius: 20px; cursor: pointer; color: var(--mdc-theme-on-secondary); }
    .card-content { display: grid; gap: 16px; overflow: auto; margin: 16px; }
    .tab-settings-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .reorder-controls { display: flex; align-items: center; padding-left: 8px; }
    .reorder-btn { cursor: pointer; color: var(--secondary-text-color); }
    .reorder-btn[disabled] { opacity: 0.3; pointer-events: none; }
    .edit-tab-panel { padding: 0; }
    .stack-editor-host {
      min-height: 200px;
      border: 1px solid var(--divider-color);
      border-radius: 8px;
      padding: 8px;
      background: var(--card-background-color, var(--sidebar-background-color));
    }
    .card-block { margin-bottom: 6px; padding: 6px; border: 1px solid var(--divider-color); border-radius: 8px; box-sizing: border-box; overflow: hidden; }
    .card-block-header {
      display: flex; justify-content: space-between; align-items: center; cursor: pointer;
      background: var(--secondary-background-color, rgba(0,0,0,0.05));
    }
    .card-block-controls { display: flex; align-items: center; gap: 8px; }
    .card-type-label { font-weight: normal; opacity: 0.7; font-size: 0.9em; }
    .add-card-btn {
      width: 100%; padding: 12px; background: var(--primary-color); color: var(--text-primary-color);
      border: none; border-radius: 8px; cursor: pointer; font-size: 14px; margin-top: 8px;
    }
    .add-card-btn.secondary { background: var(--secondary-background-color); color: var(--primary-text-color); border: 1px solid var(--divider-color); }
  `;
}
