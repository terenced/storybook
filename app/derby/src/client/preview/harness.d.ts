declare class StorybookHarness {
  setup(source: string, ...components: ComponentLike[]): this;
  renderAsHTML(options?: RenderOptions): string;
};
export default StorybookHarness;
