/* 诵读库：内置常背名篇的权威通行本原文
 * 用途：用户要求「背诵/朗读」时，若命中本库 → 原文直出（不经模型），
 *      保证一字不错、不重复、不截断；未命中 → 交给模型，并允许它坦承记不全。
 * 每首：标题、作者、朝代、别名（用于匹配）、正文（逐句数组）
 */
window.RECITE = (function () {

  const BOOK = [
    {
      id: 'jingyesi',
      title: '静夜思',
      author: '李白',
      dynasty: '唐',
      keys: ['静夜思'],
      lines: [
        '床前明月光，疑是地上霜。',
        '举头望明月，低头思故乡。'
      ]
    },
    {
      id: 'jiangjinjiu',
      title: '将进酒',
      author: '李白',
      dynasty: '唐',
      keys: ['将进酒'],
      lines: [
        '君不见，黄河之水天上来，奔流到海不复回。',
        '君不见，高堂明镜悲白发，朝如青丝暮成雪。',
        '人生得意须尽欢，莫使金樽空对月。',
        '天生我材必有用，千金散尽还复来。',
        '烹羊宰牛且为乐，会须一饮三百杯。',
        '岑夫子，丹丘生，将进酒，杯莫停。',
        '与君歌一曲，请君为我倾耳听。',
        '钟鼓馔玉不足贵，但愿长醉不复醒。',
        '古来圣贤皆寂寞，惟有饮者留其名。',
        '陈王昔时宴平乐，斗酒十千恣欢谑。',
        '主人何为言少钱，径须沽取对君酌。',
        '五花马，千金裘，呼儿将出换美酒，与尔同销万古愁。'
      ]
    },
    {
      id: 'shuidiaogetou',
      title: '水调歌头',
      author: '苏轼',
      dynasty: '宋',
      keys: ['水调歌头', '明月几时有'],
      lines: [
        '明月几时有？把酒问青天。',
        '不知天上宫阙，今夕是何年。',
        '我欲乘风归去，又恐琼楼玉宇，高处不胜寒。',
        '起舞弄清影，何似在人间。',
        '转朱阁，低绮户，照无眠。',
        '不应有恨，何事长向别时圆？',
        '人有悲欢离合，月有阴晴圆缺，此事古难全。',
        '但愿人长久，千里共婵娟。'
      ]
    },
    {
      id: 'niannujiao',
      title: '念奴娇·赤壁怀古',
      author: '苏轼',
      dynasty: '宋',
      keys: ['念奴娇', '赤壁怀古', '大江东去'],
      lines: [
        '大江东去，浪淘尽，千古风流人物。',
        '故垒西边，人道是，三国周郎赤壁。',
        '乱石穿空，惊涛拍岸，卷起千堆雪。',
        '江山如画，一时多少豪杰。',
        '遥想公瑾当年，小乔初嫁了，雄姿英发。',
        '羽扇纶巾，谈笑间，樯橹灰飞烟灭。',
        '故国神游，多情应笑我，早生华发。',
        '人生如梦，一尊还酹江月。'
      ]
    },
    {
      id: 'manjianghong',
      title: '满江红',
      author: '岳飞',
      dynasty: '宋',
      keys: ['满江红', '怒发冲冠'],
      lines: [
        '怒发冲冠，凭栏处、潇潇雨歇。',
        '抬望眼，仰天长啸，壮怀激烈。',
        '三十功名尘与土，八千里路云和月。',
        '莫等闲、白了少年头，空悲切。',
        '靖康耻，犹未雪；臣子恨，何时灭！',
        '驾长车，踏破贺兰山缺。',
        '壮志饥餐胡虏肉，笑谈渴饮匈奴血。',
        '待从头、收拾旧山河，朝天阙。'
      ]
    },
    {
      id: 'chunjianghuayueye',
      title: '春江花月夜',
      author: '张若虚',
      dynasty: '唐',
      keys: ['春江花月夜'],
      lines: [
        '春江潮水连海平，海上明月共潮生。',
        '滟滟随波千万里，何处春江无月明。',
        '江流宛转绕芳甸，月照花林皆似霰。',
        '空里流霜不觉飞，汀上白沙看不见。',
        '江天一色无纤尘，皎皎空中孤月轮。',
        '江畔何人初见月？江月何年初照人？',
        '人生代代无穷已，江月年年只相似。',
        '不知江月待何人，但见长江送流水。'
      ]
    },
    {
      id: 'chunxiao',
      title: '春晓',
      author: '孟浩然',
      dynasty: '唐',
      keys: ['春晓'],
      lines: [
        '春眠不觉晓，处处闻啼鸟。',
        '夜来风雨声，花落知多少。'
      ]
    },
    {
      id: 'dengguequolou',
      title: '登鹳雀楼',
      author: '王之涣',
      dynasty: '唐',
      keys: ['登鹳雀楼', '鹳雀楼'],
      lines: [
        '白日依山尽，黄河入海流。',
        '欲穷千里目，更上一层楼。'
      ]
    },
    {
      id: 'jiangxue',
      title: '江雪',
      author: '柳宗元',
      dynasty: '唐',
      keys: ['江雪'],
      lines: [
        '千山鸟飞绝，万径人踪灭。',
        '孤舟蓑笠翁，独钓寒江雪。'
      ]
    },
    {
      id: 'minnong',
      title: '悯农',
      author: '李绅',
      dynasty: '唐',
      keys: ['悯农'],
      lines: [
        '锄禾日当午，汗滴禾下土。',
        '谁知盘中餐，粒粒皆辛苦。'
      ]
    },
    {
      id: 'zaofabaidicheng',
      title: '早发白帝城',
      author: '李白',
      dynasty: '唐',
      keys: ['早发白帝城', '白帝城'],
      lines: [
        '朝辞白帝彩云间，千里江陵一日还。',
        '两岸猿声啼不住，轻舟已过万重山。'
      ]
    },
    {
      id: 'xiangsi',
      title: '相思',
      author: '王维',
      dynasty: '唐',
      keys: ['相思'],
      lines: [
        '红豆生南国，春来发几枝。',
        '愿君多采撷，此物最相思。'
      ]
    },
    {
      id: 'yumeiren',
      title: '虞美人',
      author: '李煜',
      dynasty: '五代',
      keys: ['虞美人', '春花秋月何时了'],
      lines: [
        '春花秋月何时了？往事知多少。',
        '小楼昨夜又东风，故国不堪回首月明中。',
        '雕栏玉砌应犹在，只是朱颜改。',
        '问君能有几多愁？恰似一江春水向东流。'
      ]
    },
    {
      id: 'yijianmei',
      title: '一剪梅',
      author: '李清照',
      dynasty: '宋',
      keys: ['一剪梅', '红藕香残'],
      lines: [
        '红藕香残玉簟秋。轻解罗裳，独上兰舟。',
        '云中谁寄锦书来？雁字回时，月满西楼。',
        '花自飘零水自流。一种相思，两处闲愁。',
        '此情无计可消除，才下眉头，却上心头。'
      ]
    },
    {
      id: 'dingfengbo',
      title: '定风波',
      author: '苏轼',
      dynasty: '宋',
      keys: ['定风波', '莫听穿林打叶声'],
      lines: [
        '莫听穿林打叶声，何妨吟啸且徐行。',
        '竹杖芒鞋轻胜马，谁怕？一蓑烟雨任平生。',
        '料峭春风吹酒醒，微冷，山头斜照却相迎。',
        '回首向来萧瑟处，归去，也无风雨也无晴。'
      ]
    },
    {
      id: 'chibi',
      title: '赤壁赋（节选）',
      author: '苏轼',
      dynasty: '宋',
      keys: ['赤壁赋', '前赤壁赋'],
      lines: [
        '清风徐来，水波不兴。',
        '举酒属客，诵明月之诗，歌窈窕之章。',
        '少焉，月出于东山之上，徘徊于斗牛之间。',
        '白露横江，水光接天。',
        '纵一苇之所如，凌万顷之茫然。',
        '浩浩乎如冯虚御风，而不知其所止；飘飘乎如遗世独立，羽化而登仙。'
      ]
    }
  ];

  /* 起头语（随机，保持人设语气） */
  const INTROS = [
    '那这首，朋友——',
    '好，念给你听——',
    '正好有这份闲心，朋友——',
    '听好了，朋友——',
    '那就借海风念一段——'
  ];

  /* 结束语（可选，轻轻收尾） */
  const OUTROS = [
    '——念完了。怎样，还入耳吗？',
    '',
    ''
  ];

  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

  /* 在用户输入里找命中的篇目（按标题/别名/首句匹配） */
  function match(text) {
    const t = String(text || '');
    if (!t) return null;
    for (const item of BOOK) {
      for (const k of item.keys) {
        if (t.includes(k)) return item;
      }
    }
    // 用正文首句的一部分匹配
    for (const item of BOOK) {
      const head = item.lines[0].replace(/[，。？！、；：]/g, '').slice(0, 6);
      if (head && t.includes(head)) return item;
    }
    return null;
  }

  /* 生成可直接播放的句子数组 */
  function recite(item) {
    if (!item) return null;
    const out = [];
    out.push(pick(INTROS));
    out.push(`《${item.title}》——${item.dynasty}·${item.author}`);
    for (const l of item.lines) out.push(l);
    const o = pick(OUTROS);
    if (o) out.push(o);
    return out;
  }

  /* 一句话起头 + 全篇（给模型做兜底展示用） */
  function asText(item) {
    if (!item) return '';
    return `《${item.title}》——${item.dynasty}·${item.author}\n` + item.lines.join('\n');
  }

  function titles() { return BOOK.map(x => x.title); }

  return { BOOK, match, recite, asText, titles };
})();
