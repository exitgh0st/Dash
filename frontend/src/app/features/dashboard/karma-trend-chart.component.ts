import { Component, computed, input } from '@angular/core';

/** One account's weekly karma gains: last week vs this week (so far). */
export interface KarmaTrendDatum {
  label: string;
  thisWeek: number;
  /** null until a last-week baseline exists — render this-week's bar alone. */
  lastWeek: number | null;
}

/** A gridline's y-position and its axis value. */
interface GridLine {
  y: number;
  label: number;
}

/** A rendered bar's geometry + fill color. */
interface Bar {
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
}

/** A rendered account group: its two bars and a short axis label. */
interface Group {
  bars: Bar[];
  cx: number;
  short: string;
}

// Bar colors: last week reads neutral-blue; this week greens up / oranges down.
const COLOR_LAST = '#4C8DF6';
const COLOR_UP = '#2DD4A7';
const COLOR_DOWN = '#F5A623';

/**
 * Paired-bar karma-trend chart rendered as inline SVG (same hand-rolled approach
 * as `CommentsBarChartComponent` — no charting library). For each account it
 * draws last week's karma gain beside this week's, so the two read as a direct
 * comparison; this week is green when it meets/beats last week, orange when it
 * trails. Before a last-week baseline exists (week 1, `lastWeek === null`) it draws
 * a single centered this-week bar instead. Negative gains (rare, from Reddit's
 * fuzzed figures) render as zero-height.
 */
@Component({
  selector: 'app-karma-trend-chart',
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
      <!-- Paired bars + per-account labels. -->
      @for (grp of view().groups; track grp.cx) {
        @for (b of grp.bars; track b.x) {
          <rect
            [attr.x]="b.x"
            [attr.y]="b.y"
            [attr.width]="b.w"
            [attr.height]="b.h"
            rx="3"
            [attr.fill]="b.fill"
          />
        }
        <text
          [attr.x]="grp.cx"
          [attr.y]="H - 12"
          text-anchor="middle"
          font-size="10"
          fill="#A9B7CE"
          font-family="JetBrains Mono"
        >
          {{ grp.short }}
        </text>
      }
    </svg>
  `,
})
export class KarmaTrendChartComponent {
  /** Account rows to render (last-week vs this-week karma gain). */
  readonly data = input<KarmaTrendDatum[]>([]);

  // SVG canvas + padding constants (match the comments chart's proportions).
  readonly W = 560;
  readonly H = 210;
  readonly PAD_L = 34;
  readonly PAD_R = 10;
  private readonly PAD_T = 12;
  private readonly PAD_B = 34;

  /** Computed geometry for gridlines and paired bars, rescaled on data change. */
  readonly view = computed<{ gridLines: GridLine[]; groups: Group[] }>(() => {
    const rows = this.data();
    const iw = this.W - this.PAD_L - this.PAD_R;
    const ih = this.H - this.PAD_T - this.PAD_B;
    // Scale to the largest gain across both series; ignore null (missing) last-week
    // values and guard against all-zero sets.
    const max = Math.max(
      1,
      ...rows.map((r) => Math.max(r.thisWeek, r.lastWeek ?? 0)),
    );

    const gridLines: GridLine[] = [];
    for (let i = 0; i <= 4; i++) {
      gridLines.push({
        y: this.PAD_T + ih - (i / 4) * ih,
        label: Math.round((i / 4) * max),
      });
    }

    const step = rows.length > 0 ? iw / rows.length : iw;
    const barWidth = Math.min(16, step * 0.28);
    const gap = 4; // space between the paired bars within a group

    const groups: Group[] = rows.map((r, i) => {
      const cx = this.PAD_L + step * i + step / 2;
      // Clamp negatives to a zero-height bar (karma gain can't sensibly be < 0).
      const barFor = (value: number, x: number, fill: string): Bar => {
        const h = (Math.max(0, value) / max) * ih;
        return { x, y: this.PAD_T + ih - h, w: barWidth, h, fill };
      };

      // No last-week baseline yet (week 1): draw a single, centered this-week bar
      // in the neutral/up color — there's nothing to compare against.
      if (r.lastWeek === null) {
        return {
          cx,
          short: r.label.slice(0, 6),
          bars: [barFor(r.thisWeek, cx - barWidth / 2, COLOR_UP)],
        };
      }

      // Paired last-vs-this: this week greens up when it meets/beats last week,
      // oranges down when it trails.
      const upOrDown = r.thisWeek >= r.lastWeek ? COLOR_UP : COLOR_DOWN;
      return {
        cx,
        short: r.label.slice(0, 6),
        bars: [
          barFor(r.lastWeek, cx - barWidth - gap / 2, COLOR_LAST),
          barFor(r.thisWeek, cx + gap / 2, upOrDown),
        ],
      };
    });

    return { gridLines, groups };
  });
}
