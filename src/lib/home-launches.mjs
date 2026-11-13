import { inLaunchBatch, launchBounds, launchTimestamp } from './launch-calendar.mjs';
export function homeLaunchGroups(projects, now=Date.now()) {
 const olderThan=launchBounds('previous',now).start;
 const valid=[...new Map(projects.filter(p=>p?.id&&p.name&&p.pageUrl).map(p=>[p.id,p])).values()];
 const sort=(items,period)=>items.sort((a,b)=>(Number(b.votes?.[period])||0)-(Number(a.votes?.[period])||0)||(launchTimestamp(b)||0)-(launchTimestamp(a)||0)||a.id.localeCompare(b.id));
 return {current:sort(valid.filter(p=>inLaunchBatch(p,'current',now)),'weekly'),previous:sort(valid.filter(p=>inLaunchBatch(p,'previous',now)),'all'),archive:sort(valid.filter(p=>launchTimestamp(p)<olderThan),'all')};
}
