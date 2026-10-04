(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PackLabSets=api;})(globalThis,()=>{
 'use strict';
 const sets={
  base1:{id:'base1',name:'Base Set',year:1999,series:'Original series',size:11,total:102,arts:['charizard','blastoise','venusaur'],highlights:[4,2,15,10,16]},
  ecard3:{id:'ecard3',name:'Skyridge',year:2003,series:'e-Card series',size:9,total:144,arts:['skyridge'],highlights:[1146,1149,1230,1209,1145],packQuote:{cents:342400,amount:3424,source:'PriceCharting',variant:'Ungraded booster pack',updated:'2026-10-04T00:00:00Z',sourceUrl:'https://www.pricecharting.com/game/pokemon-skyridge/booster-pack',unavailable:false,reference:true}}
 };
 const setOf=card=>card.set||'base1';
 const isHolo=card=>['holo','secret'].includes(card.rarity);
 const isShiny=card=>isHolo(card)||card.rarity==='reverse';
 const cardNumber=card=>`${card.number||card.id}/${String(card.number).startsWith('H')?'H32':sets[setOf(card)].total}${card.rarity==='reverse'?' · Reverse':''}`;
 const pools=(cards,set)=>Object.fromEntries(['common','uncommon','energy','rare','holo','secret','reverse'].map(r=>[r,cards.filter(c=>setOf(c)===set&&c.booster&&c.rarity===r).map(c=>c.id)]));
 function generate(cards,set,randomInt,sample){
  const p=pools(cards,set),pick=pool=>pool[randomInt(pool.length)];
  if(set==='base1')return [...sample(p.common,5),...sample(p.uncommon,3),pick(p.energy),pick(p.energy),pick(randomInt(3)===0?p.holo:p.rare)];
  const crystalReverse=randomInt(36)===0;
  const reverse=cards.filter(c=>setOf(c)===set&&c.rarity==='reverse'&&(Number(c.number)>144)===crystalReverse);
  const rare=randomInt(36)===0?pick(p.secret):pick(randomInt(3)===0?p.holo:p.rare);
  return [...sample(p.common,5),...sample(p.uncommon,2),pick(reverse.map(c=>c.id)),rare];
 }
 return {sets,setOf,isHolo,isShiny,cardNumber,pools,generate};
});
