// One eligibility rule shared by search, verification, writer and publisher.
export const DIGIVATED_LINK='https://digivated.com';
const connections=/\b(?:let[’']?s connect|looking (?:for (?:connections|mutuals)|to connect)|connect with (?:me|us)|who wants to connect|more builders on my timeline)\b/i;
const projects=/\b(?:drop|share|post|show|tell)\b[^.!?\n]{0,70}\b(?:your|what you(?:'re| are))\b[^.!?\n]{0,60}\b(?:projects?|products?|startups?|SaaS|apps?|links?|building|working on)\b/i;
const questions=/\bwhat (?:are you|is everyone) (?:building|working on)\b/i;
const exchanges=/giveaway|airdrop|follow.?back|follow for follow|like (?:and|&) (?:repost|retweet)|engagement (?:pod|exchange)/i;
const noLinks=/\b(?:no|without|don['’]t (?:post|share|drop))\s+(?:external\s+)?(?:links?|URLs?)\b/i;
export function invitationKind(text){
 if(typeof text!=='string'||exchanges.test(text))return null;
 if((projects.test(text)||questions.test(text))&&!noLinks.test(text))return 'project';
 return connections.test(text)?'connection':null;
}
export function validReply(text,source){
 if(typeof text!=='string'||!text.trim()||text.length>240||/@[a-zA-Z0-9_]/.test(text))return false;
 const links=text.match(/https?:\/\/[^\s]+/gi)||[];
 if(links.some(link=>link!==DIGIVATED_LINK)||links.length>1)return false;
 if(!links.length&&/\b(?:[a-z0-9-]+\.)+(?:com|org|net|io|ai|dev|app)\b/i.test(text))return false;
 if(links.length&&invitationKind(source)!=='project')return false;
 if(/guaranteed? (?:traffic|sales|visitors|reposts)|100%|automatically (?:bring|generate)/i.test(text))return false;
 return !!invitationKind(source);
}
export function groundedReply(candidate){
 const kind=invitationKind(candidate.text);
 if(!kind)return '';
 const topic={
 'UI/UX':'design tools','Product Design':'design tools','Frontend Development':'frontend projects','Backend Development':'backend projects','Software Engineering':'developer tools','AI & Machine Learning':'AI projects','Cybersecurity':'security tools','Tech & Startup Builders':'startup projects','Digital Products':'digital products','Indie Hackers':'indie projects','Indie Builders':'indie projects','Content Creation':'creator tools','Product Management':'product ideas','Web3':'Web3 projects','Blockchain':'blockchain projects'
 }[candidate.niche]||'independent projects';
 if(kind==='connection')return `Always glad to connect with people building ${topic}. Digivated is a home for independent projects. Let’s connect 🤝`;
 if(/feedback|review|roast/i.test(candidate.text))return `Sharing Digivated for builders looking for feedback on ${topic}. Get your project discovered and invite useful feedback. Submit for free: ${DIGIVATED_LINK}`;
 return `We’re building Digivated to help ${topic} get discovered and invite feedback. Free project submissions: ${DIGIVATED_LINK}`;
}
