'use strict';

function endTurn() {
  if (state.gameOver || state.autoSettlement) return;
  clearPlayerUndo();
  const renewalPartner = ceasefirePartner('player');
  if (renewalPartner && !state.playerDefeated && ceasefireRenewalDue('player', renewalPartner)) {
    const decision = ceasefireRenewalDecision('player', renewalPartner),
      aiWants = decision.secondWants,
      aiAccepts = decision.secondAccepts;
    if (globalThis.__HEADLESS__) {
      if (decision.agreed) renewCeasefire('player', renewalPartner);
      continueEndTurn();
      return;
    }
    showDialog(
      aiWants ? '停戦延長の申し入れ' : '停戦期間が満了します',
      aiWants
        ? `<p><strong>${META[renewalPartner].name}</strong>が停戦の継続を希望しています。応じると、現在の停戦をさらに5年間延長します。</p>`
        : `<p><strong>${META[renewalPartner].name}</strong>との停戦をさらに5年間延長するよう提案しますか。</p><p>成立見込み：<strong>${ceasefireLikelihood(renewalPartner, 'player')}</strong></p>`,
      aiWants ? '延長を受け入れる' : '延長を提案する',
      () => {
        const renewed = (aiWants || aiAccepts) && renewCeasefire('player', renewalPartner);
        continueEndTurn();
        toast(
          renewed
            ? `${META[renewalPartner].name}との停戦を5年間延長しました`
            : `${META[renewalPartner].name}は延長を拒否しました`,
        );
      },
      'DIPLOMACY',
      {
        label: '延長しない',
        handler: continueEndTurn,
      },
    );
    return;
  }
  continueEndTurn();
}
function continueEndTurn() {
  runAiCeasefireDiplomacy();
  const offer = aiCeasefireOfferToPlayer();
  if (offer) {
    if (globalThis.__HEADLESS__) {
      if (ceasefireWillingness('player', offer) >= 40) beginCeasefire(offer, 'player');
      else rejectCeasefire(offer, 'player');
      completeEndTurn();
      return;
    }
    showDialog(
      '停戦の申し入れ',
      `<p><strong>${META[offer].name}</strong>が、アルデン王国との5年間の停戦を求めています。</p><p>停戦中も建設・徴兵・中立地開拓はできますが、互いの領土へ侵攻できません。</p>`,
      '停戦を受け入れる',
      () => {
        beginCeasefire(offer, 'player');
        completeEndTurn();
      },
      'DIPLOMACY',
      {
        label: '拒否する',
        handler: () => {
          rejectCeasefire(offer, 'player');
          completeEndTurn();
        },
      },
    );
    return;
  }
  completeEndTurn();
}
function completeEndTurn() {
  if (!state.playerDefeated) produce('player');
  updateThreatNotices();
  runAiYear();
  advanceWarFatigue();
  advanceAllOccupations();
  updateSupply();
  state.year++;
  advanceDiplomacy();
  advanceRoyalSuccession();
  state.orders = state.playerDefeated ? 0 : yearlyOrders('player');
  selectedTile = null;
  checkVictory();
  render();
}
function proposePlayerCeasefire(id) {
  const status = ceasefireProposalStatus('player', id);
  if (!status.ok) return toast(status.reason);
  const likelihood = ceasefireLikelihood(id, 'player');
  showDialog(
    `${META[id].name}へ停戦を提案`,
    `<p>5年間の停戦を提案します。命令は消費しませんが、拒否された場合も3年間は再提案できません。</p><p>成立見込み：<strong>${likelihood}</strong></p>`,
    '提案する',
    () => {
      const accepted = ceasefireWillingness(id, 'player') >= 40;
      if (accepted) beginCeasefire('player', id);
      else rejectCeasefire('player', id);
      render();
      showDialog(
        accepted ? '停戦成立' : '停戦拒否',
        accepted
          ? `<p>${META[id].name}は提案を受け入れました。${state.year + 5}年の開始まで互いに侵攻できません。</p>`
          : `<p>${META[id].name}は提案を拒否しました。再提案できるのは${state.year + 3}年からです。</p>`,
        '地図へ戻る',
      );
    },
    'DIPLOMACY',
  );
}
function advanceRoyalSuccession() {
  if (state.gameOver || state.playerDefeated || state.year < state.nextSuccessionYear) return false;
  state.kingGeneration++;
  state.nextSuccessionYear = state.year + royalReignLength(state.royalSeed, state.kingGeneration);
  addLog(`第${state.kingGeneration}代国王が即位した。`, '', {
    participants: ['player'],
    important: true,
  });
  return true;
}
function checkVictory() {
  if (state.gameOver) return;
  const totalLand = conquerableLand();
  if (!state.playerDefeated && land('player') === totalLand) {
    state.autoSettlement = false;
    clearTimeout(autoSettlementTimer);
    state.victory = true;
    state.gameOver = true;
    addLog(
      `ついに第${state.kingGeneration}代国王の治世に、全${totalLand}領が一つの王冠の下に統一された。`,
      'good',
      {
        participants: ['player'],
        important: true,
      },
    );
    showDialog(
      '大陸統一',
      `<p><strong>第${state.kingGeneration}代国王</strong>の治世、<strong>${state.year}年</strong>にわたる戦いの末、アルデン王国は全${totalLand}領を統一しました。</p>`,
      '年代記を見る',
      viewChronicle,
      'VICTORY',
      { label: '新しい大陸へ', handler: () => newGame(true) },
    );
    return;
  }
  if (state.playerDefeated) {
    const ruler = aiNationIds().find((id) => state.factions[id].alive && land(id) === totalLand);
    if (ruler) {
      state.gameOver = true;
      addLog(`${META[ruler].name}が全${totalLand}領を統一し、新たな大陸の覇者となった。`, 'war', {
        participants: [ruler],
        important: true,
      });
      showDialog(
        '大陸の新たな覇者',
        `<p><strong>${META[ruler].name}</strong>が統一暦${state.year}年に全${totalLand}領を統一しました。</p>`,
        '年代記を見る',
        viewChronicle,
        'AFTER THE FALL',
        { label: '新しい大陸へ', handler: () => newGame(true) },
      );
    }
  }
}
function gameOver(reason) {
  if (state.gameOver || state.playerDefeated) return;
  state.autoSettlement = false;
  clearTimeout(autoSettlementTimer);
  state.playerDefeated = true;
  clearWarFatigueFor('player');
  clearDiplomacyFor('player');
  state.orders = 0;
  state.army = 0;
  state.tiles.forEach((t) => {
    if (t.owner === 'player') {
      t.owner = 'neutral';
      t.isolation = 0;
      t.supplyStatus = 'full';
      t.occupation = 0;
      t.capital = false;
    }
  });
  addLog(reason, 'war', { participants: ['player'], important: true });
  addLog('アルデン王国は滅亡したが、大陸の戦いはなお続いている。', 'war', {
    participants: ['player'],
    important: true,
  });
  showDialog(
    '王国滅亡',
    `<p>${reason}</p><p>統一暦${state.year}年、アルデン王国は歴史から姿を消しました。以後も年を進め、残る国家の戦いを観戦できます。</p>`,
    '観戦を続ける',
    () => {
      render();
      toast('残る国家の戦いを観戦します');
    },
    'DEFEAT',
    { label: '新しい大陸へ', handler: () => newGame(true) },
  );
}

function toast(msg) {
  $('toast').textContent = msg;
  $('toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('show'), 1800);
}
function viewChronicle() {
  chronicleTimeline = true;
  renderLog();
  document.querySelector('.chronicle-wrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function showDialog(title, body, action, handler, eyebrow = '王国評議会', secondary = null) {
  const second = $('dialogSecondary');
  $('dialog').classList.remove('help-dialog');
  $('dialogTitle').textContent = title;
  $('dialogBody').innerHTML = body;
  $('dialogAction').textContent = action;
  $('dialogEyebrow').textContent = eyebrow;
  $('dialogAction').onclick = () => {
    $('dialog').close();
    handler?.();
  };
  second.hidden = !secondary;
  if (secondary) {
    second.textContent = secondary.label;
    second.onclick = () => {
      $('dialog').close();
      secondary.handler?.();
    };
  }
  $('dialog').showModal();
}
const HELP_SECTIONS = [
  {
    id: 'basic',
    label: '基本',
    items: [
      '1年に使える命令は、すべての国で2回です。統一暦200年以降は長期戦を進めるため、すべての国で3回になります。',
      '中立地は、隣接する国が金貨・食料・民を使って開拓できます。開拓地は保護期間を経ず、安定化期間から始まります。',
      '国境線を越えて他国領を選ぶと侵攻できます。',
      '山岳・川・湖を除く、領有可能な全土地を自国領にすると統一達成です。',
    ],
  },
  {
    id: 'economy',
    label: '内政・施設',
    items: [
      '金貨は領土1マスにつき1と町1つにつき5を得て、兵力5につき1を軍の維持に使います。施設維持費はありません。',
      '食料は通常の農場1つにつき8、肥沃地では10、湿地では6を得ます。川・浅瀬・橋・湖に隣接する農場は、地形効果と重複してさらに2を得ます。民2人につき1、兵力3につき1を消費し、貯蔵上限はありません。',
      '食料に余裕があれば、民は町5個までは年1、6～15個は年2、16～25個は年3のように段階的に増えます。町は人口上限も6増やします。',
      '建物撤去を選ぶと、命令1で自国の建物を更地に戻せます。安定化中の施設も撤去できます。',
    ],
  },
  {
    id: 'war',
    label: '戦争・補給',
    items: [
      '敵領を奪うと、まず再攻撃されない占領保護期間に入ります。次は奪還可能だが占領側も侵攻拠点にできない安定化期間となり、そこを守り切ると完全な領土になります。',
      '占領保護中と安定化中は収入・施設効果がなく、侵攻や開拓の足場にもできません。安定化中は施設の建設と撤去ができます。',
      '兵舎は守備を3高め、隣接地への侵攻を3支援します。砦は建設地の守備を9高めますが、侵攻支援は行いません。',
      '駐屯兵団は各国1個まで、首都と補給がつながる安定領に金貨20・食料15・民1・命令1で編成し、その土地の守備を5高めます。移動は金貨5・食料5・命令1で、移動した年から2年後に再移動できます。',
      '駐屯地を奪われると駐屯兵団は消滅し、消滅した年から5年後に再編成できます。補給切れによる守備低下は駐屯兵団がいても通常どおり進みます。',
      '陸路・橋・浅瀬で首都とつながる領土は完全補給です。普通の川越しだけでつながる領土は限定補給となり、守備が1低下します。どの経路もない補給切れ領土は毎年さらに守備が2低下します。',
      '補給切れ領土だけを起点に侵攻する場合は、接する補給切れ領のうち最も高い守備力を侵攻兵力として扱います。',
      '首都陥落時は全国家が遷都を試みます。成功率は50%、25%、12.5%と半減し、年代記には遷都成功か国家崩壊の結果だけが記録されます。',
      '遷都に失敗した敵国は崩壊して残領が中立化し、自国はゲームオーバーになります。',
    ],
  },
  {
    id: 'terrain',
    label: '地形・橋',
    items: [
      () => `${terrainHelpSummary()}。`,
      '山岳は尾根を作り、川は大陸によって蛇行や支流が生まれ、川自体がない場合もあります。',
      '通常の川には、一国1本まで金貨40・食料15・命令1で橋を建設できます。川幅が2マスなら2マスを一度に架橋し、金貨80・食料30を使います。',
      '橋は片岸に首都とつながった安定領、対岸に自国領か中立地が必要で、既存の橋・浅瀬から2マス以内には建設できません。完成した橋は全国家が利用できます。',
    ],
  },
  {
    id: 'diplomacy-ai',
    label: '外交・AI',
    items: [
      '敵は勝算と防衛予備兵力を考え、侵攻失敗後は同じ年に再攻撃しません。',
      'AI三国の初期資源・施設効果・徴兵費用・戦闘式・命令数は共通ですが、資源の使い方と戦争判断が異なります。',
      'ヴァルドールは兵舎と突破口を重視し、攻撃後は町と軍備を整えて次の攻勢に備えます。',
      'セレノアは町・人口・金貨を蓄え、十分に有利な戦いへ絞って進出します。',
      'ローデンは農場・前線砦・人口を整え、食料80・人口12・目標兵力を満たすと、明確に有利な攻勢へ蓄えを使います。',
      '敵は補給切れの土地、領土を首都から分断できる要地、首都とその突破口を優先して攻撃します。',
      '同じ土地が6年以内に2回以上奪い合われると、AIはその土地への侵攻を一時中止し、別の前線や内政を選びます。敵首都と自国首都を守る反撃だけは例外です。',
      'AI国家は自国首都から2マス以内に迫った敵領を、相手が自国でも他のAI国家でも最優先で反撃します。',
      '最大国が領有可能地の35%以上かつ2位に5領差をつけると、国を問わず列国の警戒対象となります。警戒によって命令数や兵力が増えることはありません。',
      '戦争疲弊などの条件が揃うと、二国は5年間の停戦を結びます。満了時に双方が応じればさらに5年間延長でき、延長回数に上限はありません。一国が結べる停戦は一件までです。',
      '停戦を延長せず終了した場合または拒否後は3年間再交渉できず、最後の二国間では新しい停戦を結べません。',
      '停戦は破棄して奇襲できます。最初の侵攻に+2の補正が付きますが、条約を破った国は8年間停戦できず、全国家から攻撃を優先されます。',
      '三国の徴兵費用と初期資源は同じですが、徴兵する時期・残す人口・防衛予備兵力は国家戦略によって異なります。',
      'AI国家は敵領が2マス以内にない状態が3年続いた砦を、重要行動の後に年1つまで撤去します。',
    ],
  },
  {
    id: 'other',
    label: 'その他',
    items: [
      '新しい大陸ごとに国境・首都・地形・初期施設の構成が変わります。初期地形には国ごとの有利不利が生まれる場合があります。',
      'AI三国は毎年先手を交代し、1命令ずつ交互に行動します。占領期間も年末に全国家まとめて進むため、行動順による保護期間の差はありません。',
      '首都防衛の行動や、自国が関係する遷都・国家崩壊などの重要な出来事は年代記に記録されます。',
    ],
  },
];
function helpMarkup() {
  const sections = HELP_SECTIONS.map(
    (section) =>
      `<details class="help-section" data-help-section="${section.id}"><summary><span>${section.label}</span><i class="help-chevron" aria-hidden="true"></i></summary><div class="help-section-body"><ul>${section.items.map((item) => `<li>${typeof item === 'function' ? item() : item}</li>`).join('')}</ul></div></details>`,
  ).join('');
  return `<div class="help-accordion-actions"><button type="button" data-help-expand>すべて開く</button><button type="button" data-help-collapse>すべて閉じる</button></div><div class="help-accordion">${sections}</div>`;
}
function bindHelpAccordion() {
  const sections = [...document.querySelectorAll('[data-help-section]')];
  document.querySelector('[data-help-expand]')?.addEventListener('click', () => {
    sections.forEach((section) => (section.open = true));
  });
  document.querySelector('[data-help-collapse]')?.addEventListener('click', () => {
    sections.forEach((section) => (section.open = false));
  });
}
function help() {
  showDialog('統一への手引き', helpMarkup(), '地図へ戻る', null, 'HOW TO UNIFY');
  $('dialog').classList.add('help-dialog');
  bindHelpAccordion();
}
function selectedWorldType() {
  const selected = $('worldTypeSelect').value;
  return WORLD_VARIANTS.some((variant) => variant.name === selected) ? selected : '';
}
function newGame(force = false) {
  const start = () => {
    clearTimeout(autoSettlementTimer);
    state = createState(selectedWorldType());
    selectedAction = 'settle';
    selectedTile = null;
    chronicleTimeline = false;
    mobileBuildOpen = false;
    autoSettlementOfferShown = false;
    autoSettlementIdleYears = 0;
    clearPlayerUndo();
    render();
    toast(`${state.worldName}・${state.developmentName}で開戦しました`);
  };
  if (force) return start();
  showDialog(
    '新しい大陸を始めますか？',
    '<p>現在の年代記と領土は失われます。国境、首都、地形、初期施設は新しく組み直されます。</p>',
    '新しく始める',
    start,
    'NEW CONTINENT',
  );
}

$('worldTypeSelect').innerHTML = [
  '<option value="">ランダム</option>',
  ...WORLD_VARIANTS.map((variant) => `<option value="${variant.name}">${variant.name}</option>`),
].join('');

document.querySelectorAll('[data-action]').forEach((b) =>
  b.addEventListener('click', () => {
    selectedAction = b.dataset.action;
    render();
  }),
);
$('recruitBtn').addEventListener('click', recruit);
$('undoBtn').addEventListener('click', undoLastPlayerAction);
$('endTurnBtn').addEventListener('click', endTurn);
$('helpBtn').addEventListener('click', help);
$('newGameBtn').addEventListener('click', () => newGame());
document.querySelector('dialog .close').addEventListener('click', () => $('dialog').close());
mobileMedia.addEventListener('change', () => {
  mobileBuildOpen = false;
  render();
});
state = load() || createState();
render();
if (!localStorage.getItem(SAVE_KEY + '-welcome')) {
  localStorage.setItem(SAVE_KEY + '-welcome', '1');
  showDialog(
    '100マス統一記',
    `<p>今回は「${state.worldName}」の${state.developmentName}から始まります。あなたの王国は${land('player')}領を治め、統一対象は全${conquerableLand()}領です。</p><p>大陸ごとに異なる地形を越え、中立地を開拓しながら全土統一を目指してください。</p>`,
    '統一を始める',
  );
}
if (state.autoSettlement) scheduleAutoSettlement();
else setTimeout(maybeOfferAutoSettlement, 0);
if ('serviceWorker' in navigator)
  window.addEventListener('load', () => {
    const localDevelopment = ['localhost', '127.0.0.1'].includes(location.hostname);
    if (navigator.serviceWorker.controller && !localDevelopment) return;
    navigator.serviceWorker
      .register('sw.js?v=98')
      .then(() => navigator.serviceWorker.ready)
      .then(() => {
        const readyKey = `${SAVE_KEY}-offline-ready`;
        if (localStorage.getItem(readyKey)) return;
        localStorage.setItem(readyKey, '1');
        toast('オフライン利用の準備が完了しました');
      })
      .catch(() => {});
  });
