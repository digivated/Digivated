import {createHash} from 'node:crypto';
import {NEWS_SOURCES,canonicalNewsUrl,plainText} from './news-sources.mjs';
export const BREAKING_MAX_AGE=6*3600000;
export const NEWS_MAX_AGE=48*3600000;
const negation=/\b(?:not|no|never)\b.{0,45}\b(?:actively exploited|active exploitation|confirmed breach|global outage)\b/i;
const uncertainty=/\b(?:rumou?rs?|unconfirmed|unverified|speculat(?:ion|e|es)|reportedly|could be|might be|may have|possible breach|potential breach|investigating reports)\b/i;
const routine=/\b(?:webinar|podcast|roundup|weekly digest|monthly recap|sponsored|tips for|how to|sign up|register now|partnering with|partnership|benchmark|research paper|tutorial|announces approval of application|termination of enforcement)\b/i;
const normalize=s=>plainText(s).toLowerCase().replace(/https?:\/\/\S+/g,' ').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export function newsEventKey(candidate){
 const cves=[...new Set((candidate.headline+' '+candidate.sourceText).match(/CVE-\d{4}-\d{4,7}/gi)||[])].map(s=>s.toUpperCase()).sort();
 if(cves.length)return 'cve:'+cves.join(',');
 // Exact normalized editorial claim, not keyword similarity, prevents false merges.
 return 'headline:'+createHash('sha256').update(normalize(candidate.headline)).digest('hex').slice(0,32);
}
function excerpt(value,max=420){
 const text=plainText(value);if(text.length<=max)return text;
 const start=text.slice(0,max-1),boundary=Math.max(start.lastIndexOf('. '),start.lastIndexOf('; '));
 return boundary>180?start.slice(0,boundary+1):start.slice(0,start.lastIndexOf(' '))+'…';
}
function materiality(candidate){
 const headline=candidate.headline,body=candidate.sourceText||'',all=headline+' '+body;
 if(['openai','google'].includes(candidate.sourceId)&&/^(?:Introducing|Announcing) (?:GPT-[1-9]\d*|Gemini [1-9]\d*)[.!:]?$/i.test(headline.trim()))return {importance:85,reason:'official_major_model_generation_launch',breaking:true};
 if(candidate.sourceId==='fed'&&/\bFOMC statement\b|\b(?:raises|cuts|lowers|increases|reduces|maintains)\b.{0,75}\b(?:federal funds|interest rate|target range)\b/i.test(all))return {importance:95,reason:'official_monetary_policy_decision',breaking:true};
 if(candidate.sourceId==='sec'&&/\b(?:emergency|trading suspension|suspends trading|trading halt)\b/i.test(all))return {importance:90,reason:'official_market_intervention',breaking:true};
 if(candidate.sourceId==='sec'&&/\b(?:charges|charged|settles|settlement|fraud)\b/i.test(all)&&/\$[\d,.]+\s*(?:billion|trillion)\b/i.test(all))return {importance:85,reason:'major_official_enforcement_action',breaking:true};
 if(/\b(?:actively exploited|active exploitation|exploited in the wild|under active attack)\b/i.test(all)&&/\b(?:Chrome|Windows|Android|iOS|Exchange|Fortinet|Cisco|Citrix|Ivanti|VMware|PAN.OS|SharePoint|Apache|Linux|Microsoft|Google)\b/i.test(all))return {importance:95,reason:'vendor_confirmed_active_exploitation',breaking:true};
 if(/\b(?:confirms|confirmed|discloses|announces)\b.{0,90}\b(?:global|widespread|major)\b.{0,70}\b(?:outage|security incident|data breach)\b/i.test(all))return {importance:90,reason:'official_major_incident_confirmation',breaking:true};
 if(/\b(?:acquires|acquisition|to acquire)\b/i.test(all)&&/\$[\d,.]+\s*billion\b/i.test(all))return {importance:80,reason:'official_material_acquisition',breaking:true};
 if(candidate.sourceId==='microsoft-security'&&/\b(?:has observed|observed|identified|detected|began targeting)\b/i.test(all)&&/\b(?:threat actor|cybercriminal|attackers|threat actors)\b/i.test(all)&&/\b(?:financial sector|critical infrastructure|government|healthcare|hospitals)\b/i.test(all))return {importance:75,reason:'vendor_observed_significant_threat_campaign',breaking:false};
 return null;
}
export function assessCandidate(candidate,{now=Date.now()}={}){
 const reject=reason=>({decision:'reject',classification:'update',summary:'',reasons:[reason],importance:0});
 const review=reason=>({decision:'review',classification:'update',summary:'',reasons:[reason],importance:0});
 if(!candidate||typeof candidate.headline!=='string'||!candidate.headline.trim())return reject('missing_headline');
 const source=NEWS_SOURCES.find(s=>s.id===candidate.sourceId);
 if(!source||!canonicalNewsUrl(candidate.sourceUrl,source))return reject('source_not_allowlisted');
 const timestamp=Date.parse(candidate.sourcePublishedAt||'');
 if(!Number.isFinite(timestamp)||candidate.evidence?.timePrecision!=='second')return review('exact_original_publication_time_unconfirmed');
 const age=now-timestamp;
 if(age<0)return review('source_publication_time_in_future');
 if(age>NEWS_MAX_AGE)return reject('story_outside_recency_window');
 if(candidate.evidence?.verified!==true||!candidate.evidence.headlineMatched||!candidate.evidence.summarySupported||candidate.evidence.originalPublicationTimeConfirmed!==true)return {...review('source_verification_incomplete'),reasons:['source_verification_incomplete',...(candidate.evidence?.verificationReasons||[])]};
 if(candidate.evidence.articlePublishedAt&&Math.abs(Date.parse(candidate.evidence.articlePublishedAt)-timestamp)>60000)return review('source_timestamp_mismatch');
 const text=candidate.headline+' '+candidate.sourceText;
 if(/\b(?:last (?:week|month|year)|previously (?:reported|disclosed)|retrospective|looking back)\b/i.test(text))return review('historical_context_requires_review');
 if(uncertainty.test(text)||negation.test(text))return review('claim_or_importance_requires_editorial_verification');
 if(routine.test(candidate.headline))return reject('routine_or_promotional_update');
 const significant=materiality(candidate);
 if(!significant)return review('importance_requires_editorial_judgment');
 const category=/\b(?:vulnerabilit|zero.day|exploit|breach|cyber|ransomware|threat actor)/i.test(text)?'security':candidate.category;
 if(!['ai-tech','markets','security'].includes(category))return review('category_unconfirmed');
 const summary=excerpt(candidate.sourceText);
 if(summary.length<60)return review('source_summary_too_short');
 return {decision:'publish',classification:significant.breaking&&age<=BREAKING_MAX_AGE?'breaking':'update',category,summary,importance:significant.importance,reasons:[significant.reason],eventKey:newsEventKey(candidate),policyVersion:'news-primary-source-v1'};
}
