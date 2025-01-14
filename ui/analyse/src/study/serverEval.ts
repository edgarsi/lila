import { defined, prop } from 'common';
import { bind, onInsert } from 'common/snabbdom';
import spinner from 'common/spinner';
import Highcharts from 'highcharts';
import { h, VNode } from 'snabbdom';
import AnalyseCtrl from '../ctrl';

interface HighchartsHTMLElement extends HTMLElement {
  highcharts: Highcharts.ChartObject;
}

export default class ServerEval {
  requested = prop(false);
  lastPly = prop<number | false>(false);
  chartEl = prop<HighchartsHTMLElement | null>(null);

  constructor(readonly root: AnalyseCtrl, readonly chapterId: () => string) {
    lichess.pubsub.on('analysis.change', (_fen: string, _path: string, mainlinePly: number | false) => {
      if (!lichess.advantageChart || this.lastPly() === mainlinePly) return;
      const lp = this.lastPly(typeof mainlinePly === 'undefined' ? this.lastPly() : mainlinePly),
        el = this.chartEl(),
        chart = el && el.highcharts;
      if (chart) {
        if (lp === false) this.unselect(chart);
        else {
          const point = chart.series[0].data[lp - 1 - root.tree.root.ply];
          if (defined(point)) point.select();
          else this.unselect(chart);
        }
      } else this.lastPly(false);
    });
  }

  unselect = (chart: Highcharts.ChartObject) => chart.getSelectedPoints().forEach(p => p.select(false));

  reset = () => {
    this.requested(false);
    this.lastPly(false);
  };

  onMergeAnalysisData = () => {
    if (lichess.advantageChart) lichess.advantageChart.update(this.root.data);
  };
  request = () => {
    this.root.socket.send('requestAnalysis', this.chapterId());
    this.requested(true);
  };
}

export function view(ctrl: ServerEval): VNode {
  const analysis = ctrl.root.data.analysis;

  if (!ctrl.root.showComputer()) return disabled();
  if (!analysis) return ctrl.requested() ? requested() : requestButton(ctrl);

  return h(
    'div.study__server-eval.ready.' + analysis.id,
    {
      hook: onInsert(el => {
        ctrl.lastPly(false);
        lichess.requestIdleCallback(
          () =>
            lichess.loadScript('javascripts/chart/acpl.js').then(() => {
              lichess.advantageChart!(ctrl.root.data, ctrl.root.trans, el);
              ctrl.chartEl(el as HighchartsHTMLElement);
            }),
          800
        );
      }),
    },
    [h('div.study__message', spinner())]
  );
}

const disabled = () => h('div.study__server-eval.disabled.padded', 'You disabled computer analysis.');

const requested = () => h('div.study__server-eval.requested.padded', spinner());

function requestButton(ctrl: ServerEval) {
  const root = ctrl.root,
    noarg = root.trans.noarg;
  return h(
    'div.study__message',
    root.mainline.length < 5
      ? h('p', noarg('theChapterIsTooShortToBeAnalysed'))
      : !root.study!.members.canContribute()
      ? [noarg('onlyContributorsCanRequestAnalysis')]
      : [
          h('p', [noarg('getAFullComputerAnalysis'), h('br'), noarg('makeSureTheChapterIsComplete')]),
          h(
            'a.button.text',
            {
              attrs: {
                'data-icon': '',
                disabled: root.mainline.length < 5,
              },
              hook: bind('click', ctrl.request, root.redraw),
            },
            noarg('requestAComputerAnalysis')
          ),
        ]
  );
}
