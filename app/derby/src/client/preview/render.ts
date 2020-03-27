import { document } from 'global';
import dedent from 'ts-dedent';
import { RenderMainArgs } from './types';
import StorybookHarness from './harness';

const rootElement = document.getElementById('root');

export default function renderMain({
  storyFn,
  selectedKind,
  selectedStory,
  showMain,
  showError,
  forceRender,
}: RenderMainArgs) {
  const element = storyFn();

  showMain();
  if (typeof element === 'string') {
    const harness = new StorybookHarness();
    harness.setup(element);
    rootElement.innerHTML = harness.renderAsHTML();
    rootElement.appendChild(element);
  } else {
    showError({
      title: `Expecting an Derby snippet: "${selectedStory}" of "${selectedKind}".`,
      description: dedent`
        Did you forget to return the Derby snippet from the story?
        Use "() => <your snippet or node>" or when defining the story.
      `,
    });
  }
}
