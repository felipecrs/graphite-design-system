import { Component, h, Prop, Watch, Element } from '@stencil/core';
import { scrollIntoView } from '../../utils/scroll';
import { emit } from '../../utils/event';

@Component({
  tag: 'gr-tab-group',
  styleUrl: 'tab-group.scss',
  shadow: true
})
export class TabGroup {
  private resizeObserver: ResizeObserver;
  private mutationObserver: MutationObserver;
  private tabs: HTMLGrTabElement[] = [];
  private panels: HTMLGrTabPanelElement[] = [];
  private activeTab?: HTMLGrTabElement;

  @Element() el!: HTMLGrTabGroupElement;

  private body: HTMLElement = this.el.shadowRoot?.querySelector('.tab-group__body');

  @Prop() placement: 'top' | 'bottom' | 'start' | 'end' = 'top';

  /**
   * Set to true to draw a pill-style tab with rounded edges.
   */
  @Prop({ reflect: true }) pill = false;

  /**
  * The tab's size.
  */
  @Prop({ reflect: true }) tabSize: 'small' | 'medium' | 'large' = 'medium';


  private indicator: HTMLElement = this.el.shadowRoot?.querySelector('.tab-group__indicator');

  connectedCallback() {
    this.handleClick = this.handleClick.bind(this);
    this.handleTabsPanelsChange = this.handleTabsPanelsChange.bind(this);

    this.resizeObserver = new ResizeObserver(() => {
      this.preventIndicatorTransition();
      this.repositionIndicator();
    });

    this.mutationObserver = new MutationObserver(mutations => {
      // Update aria labels when the DOM changes
      if (mutations.some(m => !['aria-labelledby', 'aria-controls'].includes(m.attributeName!))) {
        setTimeout(() => this.setAriaLabels());
      }
    });
  }

  componentDidLoad() {
    const tabGroup: HTMLElement = this.el.shadowRoot.querySelector('.tab-group');
    const nav = this.el.shadowRoot.querySelector('slot[name="nav"]') as HTMLSlotElement;

    this.handleTabsPanelsChange();
    this.mutationObserver.observe(this.el, { attributes: true, childList: true, subtree: true });
    this.resizeObserver.observe(nav);

    // Set initial tab state when the tabs first become visible
    const intersectionObserver = new IntersectionObserver((entries, observer) => {
      if (entries[0].intersectionRatio > 0) {
        this.setAriaLabels();
        this.setActiveTab(this.getActiveTab() ?? this.tabs[0], { emitEvents: false });
        observer.unobserve(entries[0].target);
      }
    });
    intersectionObserver.observe(tabGroup);
  }

  disconnectedCallback() {
    const nav = this.el.shadowRoot.querySelector('slot[name="nav"]') as HTMLSlotElement;

    this.mutationObserver.disconnect();
    this.resizeObserver.unobserve(nav);
  }

  getTabs() {
    const slot = this.el.shadowRoot.querySelector('slot[name="nav"]') as HTMLSlotElement;

    return [...slot.assignedElements({ flatten: true })].filter(
      (el: any) => {
        return el.tagName.toLowerCase() === 'gr-tab'
      }) as [HTMLGrTabElement];
  }

  getPanels() {
    const slot = this.body.querySelector('slot') as HTMLSlotElement;

    return [...slot.assignedElements({ flatten: true })].filter(
      (el: any) => el.tagName.toLowerCase() === 'gr-tab-panel') as [HTMLGrTabPanelElement];
  }

  getActiveTab() {
    return this.getTabs().find(el => el.active);
  }

  handleClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    const tab = target.closest('gr-tab');
    const tabGroup = tab?.closest('gr-tab-group');

    if (tabGroup !== this.el) {
      return;
    }

    if (tab !== null) {
      this.setActiveTab(tab, { scrollBehavior: 'smooth' });
    }
  }

  setActiveTab(tab: HTMLGrTabElement, options?: { emitEvents?: boolean; scrollBehavior?: 'auto' | 'smooth' }) {
    const nav = this.el.shadowRoot.querySelector('slot[name="nav"]') as HTMLSlotElement;

    options = {
      emitEvents: true,
      scrollBehavior: 'auto',
      ...options
    };

    tab.setFocus();

    if (tab !== this.activeTab) {
      const previousTab = this.activeTab;
      this.activeTab = tab;

      // Sync active tab and panel
      this.tabs.map(el => (el.active = el === this.activeTab));
      this.panels.map(el => (el.active = el.name === this.activeTab?.panel));
      this.handleIndicatorChange();

      if (['top', 'bottom'].includes(this.placement)) {
        scrollIntoView(this.activeTab, nav, 'horizontal', options.scrollBehavior);
      }

      // Emit events/
      if (options.emitEvents) {
        if (previousTab) {
          emit(this.el, 'gr-tab-hide', { detail: { name: previousTab.panel } });
        }

        emit(this.el, 'gr-tab-show', { detail: { name: this.activeTab.panel } });
      }
    }
  }

  setAriaLabels() {
    // Link each tab with its corresponding panel
    this.tabs.forEach(tab => {
      const panel = this.panels.find(el => el.name === tab.panel);
      if (panel) {
        tab.setAttribute('aria-controls', panel.getAttribute('id')!);
        panel.setAttribute('aria-labelledby', tab.getAttribute('id')!);
      }
    });
  }

  @Watch('placement')
  handleIndicatorChange(): void {
    const tab = this.getActiveTab();

    if (tab && !this.pill) {
      this.indicator.style.display = 'block';
      this.repositionIndicator();
    } else {
      this.indicator.style.display = 'none';
    }
  }

  repositionIndicator() {
    const currentTab = this.getActiveTab();

    if (!currentTab) {
      return;
    }

    const width = currentTab.clientWidth;
    const height = currentTab.clientHeight;
    const allTabs = this.getTabs();
    const precedingTabs = allTabs.slice(0, allTabs.indexOf(currentTab));
    const offset = precedingTabs.reduce(
      (previous, current) => ({
        left: previous.left + current.clientWidth,
        top: previous.top + current.clientHeight
      }),
      { left: 0, top: 0 }
    );

    switch (this.placement) {
      case 'top':
      case 'bottom':
        this.indicator.style.width = `${width}px`;
        this.indicator.style.height = 'auto';
        this.indicator.style.transform = `translateX(${offset.left}px)`;
        break;

      case 'start':
      case 'end':
        this.indicator.style.width = 'auto';
        this.indicator.style.height = `${height}px`;
        this.indicator.style.transform = `translateY(${offset.top}px)`;
        break;
    }
  }

  preventIndicatorTransition(): void {
    const transitionValue = this.indicator.style.transition;
    this.indicator.style.transition = 'none';

    requestAnimationFrame(() => {
      this.indicator.style.transition = transitionValue;
    });
  }

  // Store tabs and panels in a cache.
  handleTabsPanelsChange(): void {
    this.tabs = this.getTabs();
    this.panels = this.getPanels();
    this.handleIndicatorChange();
  }

  render(): any {
    const { placement, pill, tabSize } = this;

    return (
      <div
        class={{
          'tab-group': true,
          'tab-group--top': placement === 'top',
          'tab-group--bottom': placement === 'bottom',
          'tab-group--start': placement === 'start',
          'tab-group--end': placement === 'end',
        }}
        onClick={this.handleClick}
      >
        <div class="tab-group__nav-container" part="nav">
          <div class="tab-group__nav">
            <div part="tabs" class={{ 'tab-group__tabs': true, 'tab-pill': pill, [`tab-${tabSize}`]: true, }} role="tablist">
              <div part="active-tab-indicator" class="tab-group__indicator" ref={el => (this.indicator = el)} />

              <slot name="nav" onSlotchange={this.handleTabsPanelsChange} />
            </div>
          </div>
        </div>
        <div part="body" class="tab-group__body" ref={el => (this.body = el)}>
          <slot onSlotchange={this.handleTabsPanelsChange} />
        </div>
      </div>
    )
  }
}