/* eslint no-param-reassign: ["error", { "props": false }] */
import qs from 'qs';
import { parse as urlParse } from 'url';
import { Model } from 'racer';
import App from 'derby/lib/App';
import DerbyStandalone from 'derby/lib/DerbyStandalone';

class AppHarness extends App {
  constructor(harness) {
    super();
    this.harness = harness;
  }

  createPage() {
    return new this.Page(this, this.harness.model);
  }

  // `_init()` does setup for loading views from files on the server and loading
  // serialized views and data on the client
  _init() {
    this.initLoad();
  }
}

// Load views by filename. The client version of this method is a no-op
AppHarness.prototype.loadViews = DerbyStandalone.prototype.loadViews;

// Register default compilers so that StorybookHarness can load views & styles from
// the filesystem
// eslint-disable-next-line no-underscore-dangle
AppHarness.prototype.initLoad = DerbyStandalone.prototype._initLoad;

/**
 * Creates a `StorybookHarness`.
 *
 * If arguments are provided, then `#setup` is called with the arguments.
 */
export default class StorybookHarness {
  constructor(...args) {
    this.app = new AppHarness(this);
    this.model = new Model();

    if (args.length > 0) {
      this.setup(...args);
    }
  }

  /** @typedef { {view: {is: string, source?: string}} } InlineComponent */
  /**
   * Sets up the harness with a HTML template, which should contain a `<view is="..."/>` for the
   * component, and the components to register.
   *
   * @param {string} source - HTML template for the harness page
   * @param {...(Component | InlineComponent} components - components to register
   *
   * @example
   *   var harness = new StorybookHarness().setup('<view is="dialog"/>', Dialog);
   */
  setup(source, ...args) {
    this.app.views.register('$harness', source);
    // Remaining variable arguments are components
    args.forEach(constructor => {
      this.app.component(constructor);
    });
    return this;
  }

  /**
   * Stubs out view names with empty view or the provided source.
   *
   * A view name is a colon-separated string of segments, as used in `<view is="...">`.
   *
   * @example
   *   var harness = new StorybookHarness('<view is="dialog"/>', Dialog).stub(
   *     'icons:open-icon',
   *     'icons:close-icon',
   *     {is: 'dialog:buttons', source: '<button>OK</button>'}
   *   );
   */
  stub(...args) {
    args.forEach(arg => {
      if (typeof arg === 'string') {
        this.app.views.register(arg, '');
      } else if (arg && arg.is) {
        this.app.views.register(arg.is, arg.source || '');
      } else {
        throw new Error(
          'each argument must be the name of a view or an object with an `is` property'
        );
      }
    });
    return this;
  }

  /**
   * Stubs out view names as components.
   *
   * This can be used to test the values being bound to ("passed into") child components.
   *
   * @example
   *   var harness = new StorybookHarness('<view is="dialog"/>', Dialog)
   *     .stubComponent('common:file-picker', {is: 'footer', as: 'stubFooter'});
   */
  stubComponent(...args) {
    args.forEach(arg => {
      const options = typeof arg === 'string' ? { is: arg } : arg;
      const Stub = createStubComponent(options);
      this.app.component(Stub);
    });
    return this;
  }

  /**
   * @typedef {Object} RenderOptions
   * @property {string} [url] - Optional URL for the render, used to populate `page.params`
   */
  /**
   * Renders the harness into a HTML string, as server-side rendering would do.
   *
   * @param {RenderOptions} [options]
   * @returns { Page & {html: string} } - a `Page` that has a `html` property with the rendered HTML
   *   string
   */
  renderHtml(options) {
    return this.performRender(page => {
      page.html = page.get('$harness');
    }, options);
  }

  /**
   * Renders the harness into a `DocumentFragment`, as client-side rendering would do.
   *
   * @param {RenderOptions} [options]
   * @returns { Page & {fragment: DocumentFragment} } a `Page` that has a `fragment` property with the
   *   rendered `DocumentFragment`
   */
  renderDom(options) {
    return this.performRender(page => {
      page.fragment = page.getFragment('$harness');
    }, options);
  }

  attachTo(parentNode, node) {
    return this.performRender(page => {
      const view = page.getView('$harness');
      const targetNode = node || parentNode.firstChild;
      view.attachTo(parentNode, targetNode, page.context);
    });
  }

  renderAsHTML(options) {
    return this.renderHtml(options).html;
  }

  /**
   * @param {(page: Page) => void} render
   * @param {RenderOptions} [options]
   */
  performRender(render, options = {}) {
    const page = this.app.createPage();
    // Set `page.params`, which is usually created in tracks during `Page#render`:
    // https://github.com/derbyjs/tracks/blob/master/lib/index.js
    function setPageUrl(url) {
      page.params = {
        url,
        query: qs.parse(urlParse(url).query),
        body: {},
      };
      // Set "$render.params", "$render.query", "$render.url" based on `page.params`.
      // eslint-disable-next-line no-underscore-dangle
      page._setRenderParams();
    }
    setPageUrl(options.url || '');
    // Fake some methods from tracks/lib/History.js.
    // JSDOM doesn't really support updating the window URL, but this should work for Derby code that
    // pulls URL info from the model or page.
    this.app.history = { push: setPageUrl, replace: setPageUrl };

    render(page);
    // HACK: Implement getting an instance as a side-effect of rendering. This
    // code relies on the fact that while rendering, components are instantiated,
    // and a reference is kept on page._components. Since we just created the
    // page, we can reliably return the first component.
    //
    // The more standard means for getting a reference to a component controller
    // would be to add a hooks in the view with `as=` or `on-init=`. However, we
    // want the developer to pass this view in, so they can supply whatever
    // harness context they like.
    //
    // This may need to be updated if the internal workings of Derby change.
    // eslint-disable-next-line no-underscore-dangle
    page.component = page._components._1;
    return page;
  }
}

StorybookHarness.createStubComponent = createStubComponent;

function createStubComponent(options) {
  const as = options.as || options.is;
  const { asArray } = options;

  function StubComponent() {}
  StubComponent.view = {
    is: options.is,
    file: options.file,
    source: options.source,
    dependencies: options.dependencies,
  };
  function asArrayInit() {
    const { page } = this;
    if (page[asArray]) {
      page[asArray].push(this);
    } else {
      page[asArray] = [this];
    }
    this.on('destroy', () => {
      const index = page[asArray].indexOf(this);
      if (index === -1) return;
      page[asArray].splice(index, 1);
    });
  }
  function init() {
    const { page } = this;
    page[as] = this;
    this.on('destroy', () => {
      page[as] = undefined;
    });
  }
  StubComponent.prototype.init = asArray ? asArrayInit : init;
  return StubComponent;
}
