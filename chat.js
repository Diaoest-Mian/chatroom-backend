import { Configuration, OpenAIApi } from 'openai'
import fs from 'fs'
import https from 'https'
import WebSocket from 'ws'
import psl from 'psl'
import axios from 'axios'
import schedule from 'node-schedule'

const configuration = new Configuration({
  apiKey: 'sk-666666666666666666666666666666666666666666666667'
})
const openai = new OpenAIApi(configuration)
var conversationLog = [{ role: 'system', content: '你是ChatGPT，OpenAI训练的大型语言模型。尽可能简短的回答问题。' }];


export async function getOpenAiReply(data, domainFrom) {
  let prompt = data.msg
  // console.log('/ prompt', prompt)

  if (conversationLog.length > 20)
  {
	// 删除一个回合的对话
	conversationLog.pop();
	conversationLog.pop();
  }
  conversationLog.push({
	role: 'user',
	content: prompt,
  });

  var reply = "";
  var is_fine = true;
  const response = await openai.createChatCompletion({
	model: 'gpt-3.5-turbo',
	messages: conversationLog,
	// max_tokens: 256, // limit token usage
  })
  .catch((error) => {
	console.log(`OPENAI ERR: ${error}`);
	reply = error;
	is_fine = false;
  });

  if(is_fine)
  {
	reply = response.data.choices[0].message.content;
  	// gpt的回答也存起来，才能有上下文
  	conversationLog.push({
		role: 'assistant',
		content: reply,
  	});
  }
  
  // console.log('/ reply', reply)
  // return reply
  let json = {
	msg: `@${data.name} ${reply}`,
	time: Date.now(),
	id: 37293031037,
	name: 'GPT',
	robot: true
  }
  setTimeout(()=>{
	broadcastMessage(json, domainFrom);
	logMessageHistory(json, domainFrom);
  }, 500);
}


const tuling123ApiUrl = 'http://openapi.tuling123.com/openapi/api/v2';
const tuling123ApiKeyArr = [
	'5da047a95db8450ea6e777dd065d4be4' //你自己的图灵123ApiKey, 不要用我的^_^
	]
const tuling123ApiKey = ()=>{
	const len = tuling123ApiKeyArr.length;
	return tuling123ApiKeyArr[~~(Math.random()*len)]
};

// 每周一清空周榜
schedule.scheduleJob('59 59 23 * * 0', function(){
	clearDomainBillboard();
});

const server = new https.createServer({
	// 这里的域名是你用于WSS通信的域名
	cert: fs.readFileSync('/etc/nginx/conf/ssl/ws.tianba.tk.cer'), //你自己域名的SSL证书 ^_^
	key: fs.readFileSync('/etc/nginx/conf/ssl/ws.tianba.tk.key') //你自己域名的SSL私钥 ^_^
});
const wss = new WebSocket.Server({ server });

function noop(){}

wss.on('connection', ws => {
	if(wss.clients.size>200){
		return ws.terminate();
	}
	ws.isAlive = 2;
	ws.id = Date.now();
	ws.name = genRandomName();
	ws.on('pong', () => (ws.isAlive = 2));
	ws.on('message', msg => onReceiveMessage(msg, ws));
});

server.listen(2087); // 如果域名开启了CDN，需要是服务商(我用的是cloudflare)支持的https端口

setInterval(() => {
	// console.log(Date.now(), 'clients:', wss.clients.size);
	broadcastMemberList();
	terminateDeadWs();
}, 15000);

let messageHistory=[];
readMessageHistory();

let domainBillboard=[];
readDomainBillboard();

function readMessageHistory(){
	let str;
	try {
		str = fs.readFileSync('./chat-history.txt').toString('utf-8') || '[]';
	} catch (e){
		str = '[]';
	}
	try {
		str = JSON.parse(str);
	} catch (e){
		str = [];
	}
	messageHistory = str;
}

function saveMessageHistory(){
	let str = JSON.stringify(messageHistory, null, 2);
	fs.writeFile('./chat-history.txt', str, ()=>{});
}

function readDomainBillboard(){
	let str;
	try {
		str = fs.readFileSync('./chat-domain.txt').toString('utf-8') || '[]';
	} catch (e){
		str = '[]';
	}
	try {
		str = JSON.parse(str);
	} catch (e){
		str = [];
	}
	domainBillboard = str;
}

function saveDomainBillboard(){
	let str = JSON.stringify(domainBillboard, null, 2);
	fs.writeFile('./chat-domain.txt', str, ()=>{});
}

function pushDomain(domainFrom){
	if(psl.parse(domainFrom).listed===false) return;
	let arr = domainBillboard;
	let item = arr.find(i=>i.domainFrom === domainFrom);
	if (!item){
		arr.push({
			domainFrom: domainFrom,
			times: 1
		});
	} else {
		item.times++;
	}
	saveDomainBillboard();
}

function loadDomainBillboard(){
	let arr = domainBillboard;
	arr.sort((i,j)=>(j.times-i.times));
	return arr.slice(0,3);
}

function clearDomainBillboard(){
	domainBillboard = [];
	saveDomainBillboard();
}

function getMemberList(){
	let arr = [];
	wss.clients.forEach(ws=>{
		arr.push({
			id: ws.id,
			name: ws.name
		})
	});
	return arr;
}

function broadcastMemberList(domainFrom=undefined){
	[...wss.clients].filter(i=>(!domainFrom || i.domainFrom===domainFrom))
	.forEach(ws => {
		if(ws.isAlive <= 0 || ws.readyState !== WebSocket.OPEN) return;
		let arr = getMemberListOfDomain(wss.clients, ws.domainFrom);
		let msg = {
			type: 'memberList',
			data: arr
		};
		ws.send(JSON.stringify(msg));
	});
	function getMemberListOfDomain(clients,domainFrom){
		let output = [...clients].filter(c=>c.domainFrom===domainFrom);
		output = output.map(c=>({
			id: c.id,
			name: c.name
		}));
		output.unshift({id: 37293031037, name:'GPT'});
		output.unshift({id: 12523461428, name:'小尬'});
		return output;
	}
}

function terminateDeadWs(){
	wss.clients.forEach(ws => {
		if (ws.isAlive <= 0) return ws.terminate();
		ws.isAlive --;
		ws.ping(noop);
	});
}

function onReceiveMessage(raw, ws){
	let id = ws.id;
	let domainFrom = ws.domainFrom;
	let name = ws.name;
	let json;
	try {
		json = JSON.parse(raw);
	} catch(e){
		json = {};
	}
	if(!json.data) return;
	json.data.id = id;
	json.data.name = name;
	if(json.type === 'chat'){
		if(!domainFrom) return;
		receiveChatMessage(json.data, ws);
	} else if(json.type === 'update'){
		updateUserInfo(json.data);
	}
}

function receiveChatMessage(data={}, ws){
	if(!data.msg) return;
	data.msg = data.msg.slice(0,50)
		.replace(/\</g, '&lt;')
		.replace(/\>/g, '&gt;')
		.replace(/\&/g, '&#38;')
		.replace(/\'/g, '&#x27;')
		.replace(/\"/g, '&quot;')
		.replace(/\n/g, ' ');
	logMessageHistory(data, ws.domainFrom);
	broadcastMessage(data, ws.domainFrom);
	ackSender(ws);
}

function logMessageHistory(data, domainFrom){
	data.domainFrom = domainFrom;
	data.time = Date.now();
	messageHistory.unshift(data);
	messageHistory.length = 300;
	saveMessageHistory();
}

function broadcastMessage(data, domainFrom){
	let members = [...wss.clients].filter(ws=>{
		if(ws.isAlive <= 0 || ws.readyState !== WebSocket.OPEN) return false;
		if(ws.domainFrom !== domainFrom) return false;
		return true;
	});
	members.forEach(ws => {
		let d = {
			type: 'chat',
			data: {
				time: Date.now(),
				id: data.id,
				name: data.name,
				msg: data.msg
			}
		}
		ws.send(JSON.stringify(d));
	});
	console.log(`from:${domainFrom}, users:${members.length}, total:${wss.clients.size}, ${data.msg}`);
	if(data.msg.includes('@小尬') && !data.robot){
		robotEcho(data, domainFrom);
	}
	if(data.msg.includes('@GPT') && !data.robot)
	{
		getOpenAiReply(data, domainFrom);
	}
	if(members.length>1 && !data.robot){
		pushDomain(domainFrom);
	}
}

function ackSender(ws){
	let json = {
		type: 'ack',
		data: ''
	}
	if (ws.readyState !== WebSocket.OPEN) return;
	ws.send(JSON.stringify(json));
}

function robotEcho(data, domainFrom){
	(async function(){
		let msg = data.msg.replace(/@小尬/g, '').trim();
		msg.length === 0 ? msg = '我是新来的.' : null;
		let req = {
			"reqType": 0,
			"perception": {
				"inputText": {
					"text": msg
				}
			},
			"userInfo": {
				"apiKey": tuling123ApiKey(),
				"userId": ""+data.id
			}
		};
		let res = await axios.post(tuling123ApiUrl, req);
		res = res.data;
		if(!res || !res.intent || res.intent.code != 0 || res.results.length===0) {
			res.apiKey = req.userInfo.apiKey;
			console.log(JSON.stringify(res, null, 2));
			return;
		}
		let results = res.results;
		let echo = results.reduce((acc,val)=>{
			if(val.groupType!==0 && val.groupType!==1) return acc;
			let resultType = val.resultType;
			if(resultType!=='text' && resultType!=='url' && resultType!=='news') return acc;
			if(resultType==='text'){
				return acc + val.values[resultType] + ' ';
			} else if (resultType==='url') {
				let url = val.values.url;
				return acc + `<a target="_blank" href="${url}" title="${url}">${url.length>20 ? url.slice(0,20)+'...' : url}</a> `
			} else {
				let url = val.values[resultType][0].detailurl;
				return acc + `<a target="_blank" href="${url}" title="${url}">${url.length>20 ? url.slice(0,20)+'...' : url}</a> `
			}
		},'')
		let json = {
			msg: `@${data.name} ${echo || '^-^'}`,
			time: Date.now(),
			id: 12523461428,
			name: '小尬',
			robot: true
		}
		setTimeout(()=>{
			broadcastMessage(json, domainFrom);
			logMessageHistory(json, domainFrom);
		}, 500);
	})();
}

function robotEchoOld(domainFrom){
	const echoList = ['你是GG还是MM？','呜呜呜，我好冷啊', '我是游荡在废弃聊天室的幽…啊不，精灵', '呜呜呜呜呜……', '呜呜呜…', '呜呜呜呜…', '这里似乎只有你一个人类哦', '这个聊天室曾经有很多人类…', '房间外面的世界，是怎样的？', '我已经忘了是从什么时候就在这里的', '我被人类遗忘了…'];
	let date = new Date();
	let hour = date.getHours();
	let minute = ''+date.getMinutes();
	minute = minute[0]===minute ? '0'+minute : minute;
	let str = `你好，人类，现在是${hour}点${minute}分`;
	if(hour<15) {
		str+='，一天顺利哦~';
	} else {
		str+='，一天顺利吗？';
	}
	echoList.push(str);
	let json = {};
	json.msg = echoList[~~(Math.random()*echoList.length)];
	json.time = +date;
	json.id = 230230231210;
	json.name = '　';
	json.robot = true;
	setTimeout(()=>{
		broadcastMessage(json, domainFrom);
	}, 1900);
}

function updateUserInfo(data){
	let ws = [...wss.clients].find(ws=>ws.id===data.id);
	// ws.name = (data.name || ws.name || '').slice(0,12);
	let domain;
	if(!ws.domainFrom && data.domainFrom){
		domain = psl.parse(data.domainFrom).domain || '';
		ws.domainFrom = domain;
	}
	if(ws.readyState !== WebSocket.OPEN) return;
	let json = {
		type: "identity",
		data: {
			id: data.id,
			name: ws.name,
			domain: domain,
			history: loadMessageHistory(domain),
			billboard: loadDomainBillboard()
		}
	}
	ws.send(JSON.stringify(json));
	ws.domainFrom && broadcastMemberList(domain);
}

function loadMessageHistory(domain){
	let len = messageHistory.length;
	let arr = [];
	for(let i=0; i<len && arr.length<20; i++){
		let item = messageHistory[i];
		if(!item) break;
		if(item.domainFrom===domain){
			arr.unshift(messageHistory[i]);
		}
	}
	return arr.map(i=>({
		id: i.id,
		name: i.name,
		time: i.time,
		msg: i.msg
	}));
}

const name1Arr = ['快乐的', '冷静的', '醉熏的', '潇洒的', '糊涂的', '积极的', '冷酷的', '深情的', '粗暴的', '温柔的', '可爱的', '愉快的', '义气的', '认真的', '威武的', '帅气的', '传统的', '潇洒的', '漂亮的', '自然的', '专一的', '听话的', '昏睡的', '狂野的', '等待的', '搞怪的', '幽默的', '魁梧的', '活泼的', '开心的', '高兴的', '超帅的', '留胡子的', '坦率的', '直率的', '轻松的', '痴情的', '完美的', '精明的', '无聊的', '有魅力的', '丰富的', '繁荣的', '饱满的', '炙热的', '暴躁的', '碧蓝的', '俊逸的', '英勇的', '健忘的', '故意的', '无心的', '土豪的', '朴实的', '兴奋的', '幸福的', '淡定的', '不安的', '阔达的', '孤独的', '独特的', '疯狂的', '时尚的', '落后的', '风趣的', '忧伤的', '大胆的', '爱笑的', '矮小的', '健康的', '合适的', '玩命的', '沉默的', '斯文的', '香蕉', '苹果', '鲤鱼', '鳗鱼', '任性的', '细心的', '粗心的', '大意的', '甜甜的', '酷酷的', '健壮的', '英俊的', '霸气的', '阳光的', '默默的', '大力的', '孝顺的', '忧虑的', '着急的', '紧张的', '善良的', '凶狠的', '害怕的', '重要的', '危机的', '欢喜的', '欣慰的', '满意的', '跳跃的', '诚心的', '称心的', '如意的', '怡然的', '娇气的', '无奈的', '无语的', '激动的', '愤怒的', '美好的', '感动的', '激情的', '激昂的', '震动的', '虚拟的', '超级的', '寒冷的', '精明的', '明理的', '犹豫的', '忧郁的', '寂寞的', '奋斗的', '勤奋的', '现代的', '过时的', '稳重的', '热情的', '含蓄的', '开放的', '无辜的', '多情的', '纯真的', '拉长的', '热心的', '从容的', '体贴的', '风中的', '曾经的', '追寻的', '儒雅的', '优雅的', '开朗的', '外向的', '内向的', '清爽的', '文艺的', '长情的', '平常的', '单身的', '伶俐的', '高大的', '懦弱的', '柔弱的', '爱笑的', '乐观的', '耍酷的', '酷炫的', '神勇的', '年轻的', '唠叨的', '瘦瘦的', '无情的', '包容的', '顺心的', '畅快的', '舒适的', '靓丽的', '负责的', '背后的', '简单的', '谦让的', '彩色的', '缥缈的', '欢呼的', '生动的', '复杂的', '慈祥的', '仁爱的', '魔幻的', '虚幻的', '淡然的', '受伤的', '雪白的', '高高的', '糟糕的', '顺利的', '闪闪的', '羞涩的', '缓慢的', '迅速的', '优秀的', '聪明的', '含糊的', '俏皮的', '淡淡的', '坚强的', '平淡的', '欣喜的', '能干的', '灵巧的', '友好的', '机智的', '机灵的', '正直的', '谨慎的', '俭朴的', '殷勤的', '虚心的', '辛勤的', '自觉的', '无私的', '无限的', '踏实的', '老实的', '现实的', '可靠的', '务实的', '拼搏的', '个性的', '粗犷的', '活力的', '成就的', '勤劳的', '单纯的', '落寞的', '朴素的', '悲凉的', '忧心的', '洁净的', '清秀的', '自由的', '小巧的', '单薄的', '贪玩的', '刻苦的', '干净的', '壮观的', '和谐的', '文静的', '调皮的', '害羞的', '安详的', '自信的', '端庄的', '坚定的', '美满的', '舒心的', '温暖的', '专注的', '勤恳的', '美丽的', '腼腆的', '优美的', '甜美的', '甜蜜的', '整齐的', '动人的', '典雅的', '尊敬的', '舒服的', '妩媚的', '秀丽的', '喜悦的', '甜美的', '彪壮的', '强健的', '大方的', '俊秀的', '聪慧的', '迷人的', '陶醉的', '悦耳的', '动听的', '明亮的', '结实的', '魁梧的', '标致的', '清脆的', '敏感的', '光亮的', '大气的', '老迟到的', '知性的', '冷傲的', '呆萌的', '野性的', '隐形的', '笑点低的', '微笑的', '笨笨的', '难过的', '沉静的', '火星上的', '失眠的', '安静的', '纯情的', '要减肥的', '迷路的', '烂漫的', '哭泣的', '贤惠的', '苗条的', '温婉的', '发嗲的', '会撒娇的', '贪玩的', '执着的', '眯眯眼的', '花痴的', '想人陪的', '眼睛大的', '高贵的', '傲娇的', '心灵美的', '爱撒娇的', '细腻的', '天真的', '怕黑的', '感性的', '飘逸的', '怕孤独的', '忐忑的', '高挑的', '傻傻的', '冷艳的', '爱听歌的', '还单身的', '怕孤单的', '懵懂的'];
const name2Arr = ['','→','↗','↘','、','﹏','丶','的','の','…','，','oO','ゞ','ゝ','▍','┆','de','Dē','Dé','№','嘚','∞','灬','〆','°','丿','あ','ぴ','ミ','ㄨ','※','♂','♀','ゆ','∮','ぃ','℅'];
const name3Arr = ['嚓茶', '凉面', '便当', '毛豆', '花生', '可乐', '灯泡', '哈密瓜', '野狼', '背包', '眼神', '缘分', '雪碧', '人生', '牛排', '蚂蚁', '飞鸟', '灰狼', '斑马', '汉堡', '悟空', '巨人', '绿茶', '自行车', '保温杯', '大碗', '墨镜', '魔镜', '煎饼', '月饼', '月亮', '星星', '芝麻', '啤酒', '玫瑰', '大叔', '小伙', '哈密瓜', '数据线', '太阳', '树叶', '芹菜', '黄蜂', '蜜粉', '蜜蜂', '信封', '西装', '外套', '裙子', '大象', '猫咪', '母鸡', '路灯', '蓝天', '白云', '星月', '彩虹', '微笑', '摩托', '板栗', '高山', '大地', '大树', '电灯胆', '砖头', '楼房', '水池', '鸡翅', '蜻蜓', '红牛', '咖啡', '机器猫', '枕头', '大船', '诺言', '钢笔', '刺猬', '天空', '飞机', '大炮', '冬天', '洋葱', '春天', '夏天', '秋天', '冬日', '航空', '毛衣', '豌豆', '黑米', '玉米', '眼睛', '老鼠', '白羊', '帅哥', '美女', '季节', '鲜花', '服饰', '裙子', '白开水', '秀发', '大山', '火车', '汽车', '歌曲', '舞蹈', '老师', '导师', '方盒', '大米', '麦片', '水杯', '水壶', '手套', '鞋子', '自行车', '鼠标', '手机', '电脑', '书本', '奇迹', '身影', '香烟', '夕阳', '台灯', '宝贝', '未来', '皮带', '钥匙', '心锁', '故事', '花瓣', '滑板', '画笔', '画板', '学姐', '店员', '电源', '饼干', '宝马', '过客', '大白', '时光', '石头', '钻石', '河马', '犀牛', '西牛', '绿草', '抽屉', '柜子', '往事', '寒风', '路人', '橘子', '耳机', '鸵鸟', '朋友', '苗条', '铅笔', '钢笔', '硬币', '热狗', '大侠', '御姐', '萝莉', '毛巾', '期待', '盼望', '白昼', '黑夜', '大门', '黑裤', '钢铁侠', '哑铃', '板凳', '枫叶', '荷花', '乌龟', '仙人掌', '衬衫', '大神', '草丛', '早晨', '心情', '茉莉', '流沙', '蜗牛', '战斗机', '冥王星', '猎豹', '棒球', '篮球', '乐曲', '电话', '网络', '世界', '中心', '鱼', '鸡', '狗', '老虎', '鸭子', '雨', '羽毛', '翅膀', '外套', '火', '丝袜', '书包', '钢笔', '冷风', '八宝粥', '烤鸡', '大雁', '音响', '招牌', '胡萝卜', '冰棍', '帽子', '菠萝', '蛋挞', '香水', '泥猴桃', '吐司', '溪流', '黄豆', '樱桃', '小鸽子', '小蝴蝶', '爆米花', '花卷', '小鸭子', '小海豚', '日记本', '小熊猫', '小懒猪', '小懒虫', '荔枝', '镜子', '曲奇', '金针菇', '小松鼠', '小虾米', '酒窝', '紫菜', '金鱼', '柚子', '果汁', '百褶裙', '项链', '帆布鞋', '火龙果', '奇异果', '煎蛋', '唇彩', '小土豆', '高跟鞋', '戒指', '雪糕', '睫毛', '铃铛', '手链', '香氛', '红酒', '月光', '酸奶', '银耳汤', '咖啡豆', '小蜜蜂', '小蚂蚁', '蜡烛', '棉花糖', '向日葵', '水蜜桃', '小蝴蝶', '小刺猬', '小丸子', '指甲油', '康乃馨', '糖豆', '薯片', '口红', '超短裙', '乌冬面', '冰淇淋', '棒棒糖', '长颈鹿', '豆芽', '发箍', '发卡', '发夹', '发带', '铃铛', '小馒头', '小笼包', '小甜瓜', '冬瓜', '香菇', '小兔子', '含羞草', '短靴', '睫毛膏', '小蘑菇', '跳跳糖', '小白菜', '草莓', '柠檬', '月饼', '百合', '纸鹤', '小天鹅', '云朵', '芒果', '面包', '海燕', '小猫咪', '龙猫', '唇膏', '鞋垫', '羊', '黑猫', '白猫', '万宝路', '金毛', '山水', '音响'];

function genRandomName(){
	const len1 = name1Arr.length;
	// const len2 = name2Arr.length;
	const len3 = name3Arr.length;
	var name1 = name1Arr[~~(Math.random()*len1)];
	// name2 = name2Arr[~~(Math.random()*len2)];
	var name3 = name3Arr[~~(Math.random()*len3)];
	// return name1+name2+name3;
	return name1+name3;
}
