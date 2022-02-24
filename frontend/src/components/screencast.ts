import { LitElement, html } from "lit";
import { property, state } from "lit/decorators.js";
import { ref, createRef } from "lit/directives/ref.js";
import { guard } from "lit/directives/guard.js";
import { msg, localized } from "@lit/localize";

import LiteElement from "../utils/LiteElement";

type Message = {
  id: string; // page ID
};

type ScreencastMessage = Message & {
  msg: "screencast";
  url: string; // page URL
  data: string; // base64 PNG data
};

type CloseMessage = Message & {
  msg: "close";
};

type Page = {
  order: number;
  url: string;
};

// TODO don't hardcode
const SCREEN_WIDTH = 573;
const SCREEN_HEIGHT = 480;

/**
 * Watch page crawl
 *
 * Usage example:
 * ```ts
 * <btrix-screencast
 *   archiveId=${archiveId}
 *   crawlId=${crawlId}
 * ></btrix-screencast>
 * ```
 */
@localized()
export class Screencast extends LiteElement {
  @property({ type: String })
  authToken?: string;

  @property({ type: String })
  archiveId?: string;

  @property({ type: String })
  crawlId?: string;

  @state()
  private isConnecting: boolean = false;

  @state()
  private currentPageUrl: string | null = null;

  // Websocket connection
  private ws: WebSocket | null = null;

  private canvasEl: HTMLCanvasElement | null = null;

  // Canvas 2D context used to draw images
  private canvasContext: CanvasRenderingContext2D | null = null;

  // Images to load into canvas
  private canvasImageMap: Map<number, HTMLImageElement> = new Map([
    [0, new Image()],
  ]);

  private pageMap: Map<string, Page> = new Map();

  connectedCallback() {
    super.connectedCallback();

    if (this.archiveId && this.crawlId && this.authToken) {
      this.connectWs();
    }
  }

  async updated(changedProperties: any) {
    if (
      changedProperties.get("archiveId") ||
      changedProperties.get("crawlId") ||
      changedProperties.get("authToken")
    ) {
      // Reconnect
      this.disconnectWs();
      this.connectWs();
    }
  }

  disconnectedCallback() {
    this.disconnectWs();
    super.disconnectedCallback();
  }

  render() {
    return html`
      <figure class="relative border rounded">
        ${this.isConnecting
          ? html`
              <div
                class="absolute top-1/2 left-1/2 -mt-4 -ml-4"
                style="font-size: 2rem"
              >
                <sl-spinner></sl-spinner>
              </div>
            `
          : ""}

        <figcaption class="h-8 text-sm p-2 border-b bg-neutral-50">
          ${this.currentPageUrl}
        </figcaption>

        ${guard(
          [this.archiveId, this.crawlId, this.authToken],
          () => html`
            <canvas ${ref(this.setCanvasRef)} style="width: 100%;"> </canvas>
          `
        )}
      </figure>
    `;
  }

  private setCanvasRef(el: Element | undefined) {
    if (el) {
      this.canvasEl = el as HTMLCanvasElement;

      // Set resolution
      const ratio = window.devicePixelRatio;
      this.canvasEl.width = SCREEN_WIDTH * ratio;
      this.canvasEl.height = SCREEN_HEIGHT * ratio;

      this.canvasContext = this.canvasEl.getContext("2d")!;
      this.canvasContext.scale(ratio, ratio);

      // Set CSS size
      window.requestAnimationFrame(() => {
        const { width } = this.canvasEl!.getBoundingClientRect();

        this.canvasEl!.style.height = `${
          width * (SCREEN_HEIGHT / SCREEN_WIDTH)
        }px`;
      });
    }
  }

  private connectWs() {
    console.log("open");
    if (!this.archiveId || !this.crawlId) return;

    this.isConnecting = true;

    this.ws = new WebSocket(
      `${window.location.protocol === "https:" ? "wss" : "ws"}:${
        process.env.API_HOST
      }/api/archives/${this.archiveId}/crawls/${
        this.crawlId
      }/watch/ws?auth_bearer=${this.authToken || ""}`
    );

    // this.ws.addEventListener("open", () => {
    //   this.isConnecting = false;
    // });
    this.ws.addEventListener("error", () => {
      this.isConnecting = false;
    });
    this.ws.addEventListener("message", ({ data }) => {
      this.handleMessage(data);
    });
  }

  private disconnectWs() {
    this.isConnecting = false;

    console.log("close");

    if (this.ws) {
      this.ws.close();
    }

    this.ws = null;
  }

  private handleMessage(data: string) {
    const message: ScreencastMessage | CloseMessage = JSON.parse(data);

    // TODO multiple pages
    const { id } = message;

    if (message.msg === "screencast") {
      if (this.isConnecting) {
        this.isConnecting = false;
      }

      const page = this.pageMap.get(id) || this.addPage(message);

      this.drawPage(page, message.data);
    } else if (message.msg === "close") {
      this.removePage(message);
    }
  }

  private addPage({ id, url }: ScreencastMessage): Page {
    const page = {
      order: 0,
      url,
    };

    this.pageMap.set(id, page);

    return page;
  }

  private removePage({ id }: CloseMessage) {
    this.pageMap.delete(id);
  }

  private drawPage(page: Page, data: ScreencastMessage["data"]) {
    const { order } = page;

    this.canvasImageMap.get(order)!.src = `data:image/png;base64,${data}`;

    this.canvasContext?.drawImage(
      this.canvasImageMap.get(order)!,
      0,
      0,
      SCREEN_WIDTH,
      SCREEN_HEIGHT
    );
  }
}
