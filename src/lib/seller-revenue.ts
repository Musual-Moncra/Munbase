export type SellerRevenuePeriod={from:Date;to:Date;fromInput:string;toInput:string;dayCount:number};

const isoDate=(date:Date)=>date.toISOString().slice(0,10);
const parseDate=(value?:string)=>{
  if(!value||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
  const parsed=new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime())&&isoDate(parsed)===value?parsed:null;
};

export function resolveSellerRevenuePeriod(options:{from?:string;to?:string;days?:string;now?:Date}={}):SellerRevenuePeriod{
  const today=isoDate(options.now||new Date());
  const parsedDays=Number(options.days);const defaultDays=[7,30,90].includes(parsedDays)?parsedDays:30;
  const selectedEnd=parseDate(options.to)||parseDate(today)!;const end=new Date(selectedEnd);end.setUTCDate(end.getUTCDate()+1);
  const defaultStart=new Date(parseDate(today)!);defaultStart.setUTCDate(defaultStart.getUTCDate()-(defaultDays-1));
  const start=parseDate(options.from)||defaultStart;
  if(end<=start||end.getTime()-start.getTime()>366*86400000){
    const safeEnd=new Date(parseDate(today)!);safeEnd.setUTCDate(safeEnd.getUTCDate()+1);
    const safeStart=new Date(safeEnd);safeStart.setUTCDate(safeStart.getUTCDate()-30);
    return {from:safeStart,to:safeEnd,fromInput:isoDate(safeStart),toInput:today,dayCount:30};
  }
  return {from:start,to:end,fromInput:isoDate(start),toInput:isoDate(selectedEnd),dayCount:(end.getTime()-start.getTime())/86400000};
}
