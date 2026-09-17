export const el=(kind,layer='mid',x=50,size='m',count=1)=>({kind,layer,x,size,count});
export const design=(elements,extra={})=>({version:1,sky:'clear',light:'day',palette:'paper',density:'balanced',elements,...extra});
export const scenes={
 pavilion:design([el('peak','far',30,'l',3),el('pavilion','mid',73),el('field','near',50,'l'),el('leaf','near',20,'m',3)],{palette:'forest',light:'dusk'}),
 lake:design([el('orb','far',82,'l'),el('star','far',25,'m',6),el('water','mid',50,'l'),el('boat','near',78),el('shore','near',13,'s'),el('lantern','near',17,'m',2)],{palette:'night',light:'night',sky:'star'}),
 snow:design([el('peak','far',70,'l',2),el('field','mid',50,'l'),el('tower','near',27,'l'),el('snow','near',55,'m',6)],{sky:'snow'}),
 bridge:design([el('tree','far',85,'m',3),el('water','mid',50,'l'),el('bridge','near',52,'l'),el('shore','near',12,'s'),el('flower','near',17,'m',3),el('bird','far',25,'s',3)],{palette:'rose',light:'dawn'}),
 gate:design([el('cloud','far',73,'l',2),el('wall','mid',35,'m'),el('wall','mid',76,'m'),el('gate','mid',56,'l'),el('cabin','near',20,'s')],{palette:'sunset'}),
 reeds:design([el('hill','far',38,'m',2),el('water','mid',60,'l'),el('boat','near',78,'s',2),el('shore','near',14,'s'),el('reed','near',20,'s',5)],{palette:'ocean',sky:'fog',light:'dusk'}),
};
export const letters={
 pavilion:['雨后的亭子','山间','雨刚停，我在半山的小亭里等风吹干信纸。远处的山脊一层比一层淡，叶片在脚边缓缓翻动。此刻的宁静，想分一些给你。','forest'],
 lake:['码头的夜','北岸','今夜的水面很安静，小船轻轻停在岸边。月光越过帆边，岸上的灯笼亮着。我在这里写信，盼你读到时也能听见水声。','night'],
 snow:['雪原上的塔','西岭','眼前的原野覆盖着雪，那座塔安静地立在路旁。我摘下手套写几行字，指尖微凉，纸上的字却想写得温暖。','paper'],
 bridge:['石桥与花','南园','清晨的石桥映在水面上，岸边的花刚刚舒展。风穿过枝叶，我停下来把此刻记在纸上，想让你也看看这里。','rose'],
 gate:['城门旁的信','古城','云层从城墙上慢慢经过，门边的小屋还亮着一扇窗。我在这片安静的墙影下写信，墨迹一点点晾干。','sunset'],
 reeds:['芦苇小舟','河湾','薄雾还没散尽，水上的两只小舟轻轻摇晃。岸边芦苇迎着风，我把纸按住，把此刻柔软的风景写给你。','ocean'],
};
export function location(scene='pavilion',id='F1') {
 const [title,region,body,tone]=letters[scene];return {id,kind:'far',name:region,region,basis:'推演',summary:body,sceneTheme:'neutral',distanceToken:'distant',sourceMemoryIds:[],sourceMemoryAnchor:'',keepsake:{kind:'postcard',title,body,closing:'林砚',greeting:'写给你：',tone,design:structuredClone(scenes[scene])}};
}
