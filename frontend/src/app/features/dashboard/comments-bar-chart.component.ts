import { Component, computed, input } from '@angular/core';

/** One bar: a label and its value. */
export interface BarDatum {
  label: string;
  value: number;
}

/** A gridline's y-position and its axis value. */
interface GridLine {
  y: number;
  label: number;
}

/** A rendered bar's geometry + short axis label. */
interface Bar {
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  short: string;
}

/**
 * Single-series bar chart rendered as inline SVG (ported from the prototype's
 * `barChart`). Used for "comments by account" — no charting library, so it adds
 * no dependency and matches the mockup exactly. Give it `data`; it scales to fit.
 */
@Component({
  selector: 'app-comments-bar-chart',
  standalone: true,
  template: `
    <svg
      [attr.viewBox]="'0 0 ' + W + ' ' + H"
      width="100%"
      [attr.height]="H"
      preserveAspectRatio="xMidYMid meet"
    >
      <!-- Horizontal gridlines + axis values. -->
      @for (g of view().gridLines; track g.y) {
        <line
          [attr.x1]="PAD_L"
          [attr.y1]="g.y"
          [attr.x2]="W - PAD_R"
          [attr.y2]="g.y"
          stroke="#26324B"
          stroke-width="1"
        />
        <text
          [attr.x]="PAD_L - 6"
          [attr.y]="g.y + 3"
          text-anchor="end"
          font-size="9"
          fill="#6E7E9B"
          font-family="JetBrains Mono"
        >
          {{ g.label }}
        </text>
      }
      <!-- Bars + per-account labels. -->
      @for (b of view().bars; track b.cx) {
        <rect
          [attr.x]="b.x"
          [attr.y]="b.y"
          [attr.width]="b.w"
          [attr.height]="b.h"
          rx="3"
          fill="#2DD4A7"
        />
        <text
          [attr.x]="b.cx"
          [attr.y]="H - 12"
          text-anchor="middle"
          font-size="10"
          fill="#A9B7CE"
          font-family="JetBrains Mono"
        >
          {{ b.short }}
        </text>
      }
    </svg>
  `,
})
export class CommentsBarChartComponent {
  /** Bars to render (account label + comment count). */
  readonly data = input<BarDatum[]>([]);

  // SVG canvas + padding constants (match the prototype's proportions).
  readonly W = 560;
  readonly H = 210;
  readonly PAD_L = 34;
  readonly PAD_R = 10;
  private readonly PAD_T = 12;
  private readonly PAD_B = 34;

  /** Computed geometry for gridlines and bars, rescaled whenever data changes. */
  readonly view = computed<{ gridLines: GridLine[]; bars: Bar[] }>(() => {
    const rows = this.data();
    const iw = this.W - this.PAD_L - this.PAD_R;
    const ih = this.H - this.PAD_T - this.PAD_B;
    // Guard against an all-zero / empty set so bars never divide by zero.
    const max = Math.max(1, ...rows.map((r) => r.value));

    const gridLines: GridLine[] = [];
    for (let i = 0; i <= 4; i++) {
      gridLines.push({
        y: this.PAD_T + ih - (i / 4) * ih,
        label: Math.round((i / 4) * max),
      });
    }

    const step = rows.length > 0 ? iw / rows.length : iw;
    const barWidth = Math.min(26, step * 0.5);
    const bars: Bar[] = rows.map((r, i) => {
      const cx = this.PAD_L + step * i + step / 2;
      const h = (r.value / max) * ih;
      return {
        x: cx - barWidth / 2,
        y: this.PAD_T + ih - h,
        w: barWidth,
        h,
        cx,
        short: r.label.slice(0, 6),
      };
    });

    return { gridLines, bars };
  });
}
