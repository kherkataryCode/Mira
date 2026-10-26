import { DateTime } from 'luxon';

/** A curated English word of the day. Deterministic by date, so no AI is needed. */
export interface Word {
  word: string;
  ipa: string;
  pos: string;
  definition: string;
  examples: string[];
  collocations: string[];
  usage: string;
}

export const WORDS: Word[] = [
  { word: 'meticulous', ipa: '/məˈtɪkjələs/', pos: 'adjective', definition: 'Showing great attention to detail; very careful and precise.', examples: ['She kept meticulous notes during the incident review.', 'The audit was meticulous, down to every firewall rule.'], collocations: ['meticulous attention', 'meticulous records', 'meticulously planned'], usage: 'Positive; describes care, not slowness. Stronger than “careful”.' },
  { word: 'mitigate', ipa: '/ˈmɪtɪɡeɪt/', pos: 'verb', definition: 'To make something bad less severe, serious or painful.', examples: ['Segmentation can mitigate the impact of a breach.', 'We mitigated the risk by disabling the old protocol.'], collocations: ['mitigate the risk', 'mitigate the impact', 'mitigating controls'], usage: 'You mitigate a problem, not a person. Don’t confuse with “militate (against)”.' },
  { word: 'candid', ipa: '/ˈkændɪd/', pos: 'adjective', definition: 'Truthful and straightforward; frank.', examples: ['Thanks for the candid feedback on my report.', 'He was candid about what went wrong.'], collocations: ['candid conversation', 'candid feedback', 'to be candid'], usage: '“To be candid, …” introduces an honest, possibly unwelcome opinion.' },
  { word: 'pragmatic', ipa: '/præɡˈmætɪk/', pos: 'adjective', definition: 'Dealing with things sensibly and realistically, based on practical considerations.', examples: ['A pragmatic fix now beats a perfect one next quarter.', 'She took a pragmatic approach to patching.'], collocations: ['pragmatic approach', 'pragmatic solution', 'purely pragmatic'], usage: 'Opposite of idealistic or theoretical.' },
  { word: 'resilient', ipa: '/rɪˈzɪliənt/', pos: 'adjective', definition: 'Able to recover quickly from difficulties or withstand stress.', examples: ['A resilient network keeps working when one link fails.', 'Teams become more resilient after practice drills.'], collocations: ['highly resilient', 'resilient systems', 'build resilience'], usage: 'Used for people, systems and economies alike.' },
  { word: 'ubiquitous', ipa: '/juːˈbɪkwɪtəs/', pos: 'adjective', definition: 'Present, appearing or found everywhere.', examples: ['Smartphones are ubiquitous in modern offices.', 'Phishing emails have become ubiquitous.'], collocations: ['ubiquitous presence', 'almost ubiquitous', 'ubiquitous computing'], usage: 'Slightly formal; often used for technology.' },
  { word: 'concise', ipa: '/kənˈsaɪs/', pos: 'adjective', definition: 'Giving a lot of information clearly in few words.', examples: ['Keep the summary concise for the executives.', 'Her answer was concise and complete.'], collocations: ['concise summary', 'clear and concise', 'concise explanation'], usage: 'Praise for brevity that loses nothing important.' },
  { word: 'scrutinize', ipa: '/ˈskruːtənaɪz/', pos: 'verb', definition: 'To examine or inspect closely and thoroughly.', examples: ['Scrutinize every outbound connection from the server.', 'The board scrutinized the budget.'], collocations: ['closely scrutinize', 'scrutinize the details', 'under scrutiny'], usage: 'Noun form “scrutiny” is common: “under public scrutiny”.' },
  { word: 'ambiguous', ipa: '/æmˈbɪɡjuəs/', pos: 'adjective', definition: 'Open to more than one interpretation; not clear.', examples: ['The alert message was ambiguous.', 'Avoid ambiguous wording in policies.'], collocations: ['ambiguous wording', 'deliberately ambiguous', 'remain ambiguous'], usage: 'Different from “ambivalent”, which means having mixed feelings.' },
  { word: 'diligent', ipa: '/ˈdɪlɪdʒənt/', pos: 'adjective', definition: 'Having or showing care and effort in one’s work or duties.', examples: ['A diligent analyst checks every log source.', 'He was diligent about backups.'], collocations: ['diligent work', 'due diligence', 'diligently followed'], usage: '“Due diligence” is a fixed phrase for careful investigation before a decision.' },
  { word: 'leverage', ipa: '/ˈlevərɪdʒ/', pos: 'verb / noun', definition: 'To use something to maximum advantage.', examples: ['Leverage existing logs before buying new tools.', 'The attacker used stolen credentials as leverage.'], collocations: ['leverage data', 'gain leverage', 'leverage existing tools'], usage: 'Business-heavy; “use” is often clearer in plain writing.' },
  { word: 'nuance', ipa: '/ˈnjuːɑːns/', pos: 'noun', definition: 'A subtle difference in meaning, expression or sound.', examples: ['The nuance between risk and threat matters.', 'He missed the nuance in her reply.'], collocations: ['subtle nuance', 'nuanced view', 'capture the nuance'], usage: 'Adjective “nuanced” = showing awareness of subtle differences.' },
  { word: 'proactive', ipa: '/prəʊˈæktɪv/', pos: 'adjective', definition: 'Creating or controlling a situation rather than just responding to it.', examples: ['Proactive patching prevents many incidents.', 'Be proactive about renewing certificates.'], collocations: ['proactive approach', 'take proactive steps', 'proactive monitoring'], usage: 'Opposite of “reactive”.' },
  { word: 'redundant', ipa: '/rɪˈdʌndənt/', pos: 'adjective', definition: 'Not needed because something else does the job; or deliberately duplicated as a backup.', examples: ['Remove the redundant firewall rules.', 'We have redundant power supplies.'], collocations: ['redundant systems', 'made redundant', 'redundant copy'], usage: 'In engineering, redundancy is good (backup); in writing it is waste. In UK English “made redundant” = lost one’s job.' },
  { word: 'tenacious', ipa: '/təˈneɪʃəs/', pos: 'adjective', definition: 'Holding firmly to something; persistent and determined.', examples: ['A tenacious attacker will try many entry points.', 'She is tenacious about solving bugs.'], collocations: ['tenacious grip', 'tenacious effort', 'remarkably tenacious'], usage: 'Usually admiring.' },
  { word: 'eloquent', ipa: '/ˈeləkwənt/', pos: 'adjective', definition: 'Fluent and persuasive in speaking or writing.', examples: ['She gave an eloquent case for zero trust.', 'His silence was eloquent.'], collocations: ['eloquent speech', 'eloquent argument', 'speak eloquently'], usage: '“Eloquent silence” = silence that communicates a lot.' },
  { word: 'feasible', ipa: '/ˈfiːzəbəl/', pos: 'adjective', definition: 'Possible to do easily or conveniently.', examples: ['Is it feasible to patch before Friday?', 'A full rebuild is not feasible this week.'], collocations: ['technically feasible', 'feasibility study', 'economically feasible'], usage: 'About practicality, not likelihood.' },
  { word: 'inherent', ipa: '/ɪnˈhɪərənt/', pos: 'adjective', definition: 'Existing as a natural, permanent part of something.', examples: ['Every system has inherent risks.', 'The flaw is inherent in the protocol design.'], collocations: ['inherent risk', 'inherent in', 'inherently insecure'], usage: 'Followed by “in”: inherent in the design.' },
  { word: 'cohesive', ipa: '/kəʊˈhiːsɪv/', pos: 'adjective', definition: 'Forming a united, well-integrated whole.', examples: ['A cohesive team responds faster to incidents.', 'The app feels cohesive now.'], collocations: ['cohesive team', 'cohesive strategy', 'socially cohesive'], usage: 'Noun: cohesion.' },
  { word: 'deprecate', ipa: '/ˈdeprəkeɪt/', pos: 'verb', definition: 'In software: to mark a feature as outdated and to be removed; generally, to express disapproval.', examples: ['TLS 1.0 was deprecated years ago.', 'The old API is deprecated; migrate soon.'], collocations: ['deprecated feature', 'deprecate support', 'officially deprecated'], usage: 'Don’t confuse with “depreciate” (lose value).' },
  { word: 'vigilant', ipa: '/ˈvɪdʒɪlənt/', pos: 'adjective', definition: 'Keeping careful watch for possible danger or difficulty.', examples: ['Stay vigilant for unusual login prompts.', 'Vigilant monitoring caught the intrusion early.'], collocations: ['remain vigilant', 'vigilant eye', 'constant vigilance'], usage: 'Noun: vigilance.' },
  { word: 'articulate', ipa: '/ɑːˈtɪkjələt/ (adj), /ɑːˈtɪkjəleɪt/ (verb)', pos: 'adjective / verb', definition: 'Able to express ideas clearly; (verb) to express an idea clearly.', examples: ['She articulated the risk in one sentence.', 'He is an articulate speaker.'], collocations: ['articulate a vision', 'clearly articulated', 'highly articulate'], usage: 'Pronunciation changes between adjective and verb.' },
  { word: 'circumvent', ipa: '/ˌsɜːkəmˈvent/', pos: 'verb', definition: 'To find a way around an obstacle or rule.', examples: ['Attackers tried to circumvent MFA.', 'Don’t circumvent the change process.'], collocations: ['circumvent controls', 'circumvent the rules', 'easily circumvented'], usage: 'Often implies cleverness or rule-breaking.' },
  { word: 'paramount', ipa: '/ˈpærəmaʊnt/', pos: 'adjective', definition: 'More important than anything else; supreme.', examples: ['Safety is paramount in OT environments.', 'Availability is paramount for the control system.'], collocations: ['of paramount importance', 'paramount concern', 'is paramount'], usage: 'Usually after “is” or in “of paramount importance”.' },
  { word: 'succinct', ipa: '/səkˈsɪŋkt/', pos: 'adjective', definition: 'Briefly and clearly expressed.', examples: ['Write a succinct incident summary.', 'Her succinct answer settled the debate.'], collocations: ['succinct summary', 'succinctly put', 'short and succinct'], usage: 'Near-synonym of “concise”.' },
  { word: 'anomaly', ipa: '/əˈnɒməli/', pos: 'noun', definition: 'Something that deviates from what is standard or expected.', examples: ['The SIEM flagged an anomaly in DNS traffic.', 'This result is an anomaly.'], collocations: ['detect an anomaly', 'statistical anomaly', 'anomaly detection'], usage: 'Adjective: anomalous.' },
  { word: 'consensus', ipa: '/kənˈsensəs/', pos: 'noun', definition: 'General agreement among a group.', examples: ['We reached consensus on the patch window.', 'There is no consensus yet.'], collocations: ['reach a consensus', 'broad consensus', 'consensus view'], usage: '“General consensus” is common but slightly redundant.' },
  { word: 'expedite', ipa: '/ˈekspədaɪt/', pos: 'verb', definition: 'To make an action or process happen sooner or faster.', examples: ['Can we expedite the security review?', 'They expedited the emergency patch.'], collocations: ['expedite the process', 'expedite delivery', 'expedited review'], usage: 'Formal; common in workplace requests.' },
  { word: 'obsolete', ipa: '/ˈɒbsəliːt/', pos: 'adjective', definition: 'No longer produced or used; out of date.', examples: ['The obsolete PLC no longer gets updates.', 'Fax is nearly obsolete.'], collocations: ['become obsolete', 'obsolete technology', 'render obsolete'], usage: '“Render something obsolete” = make it out of date.' },
  { word: 'stringent', ipa: '/ˈstrɪndʒənt/', pos: 'adjective', definition: 'Strict, precise and exacting.', examples: ['Stringent access controls protect the plant.', 'The new rules are stringent.'], collocations: ['stringent requirements', 'stringent controls', 'more stringent'], usage: 'Used for rules, standards, tests.' },
];

export function wordForDate(localDate: string): Word {
  const day = Math.floor(DateTime.fromISO(localDate, { zone: 'utc' }).toMillis() / 86_400_000);
  return WORDS[((day % WORDS.length) + WORDS.length) % WORDS.length]!;
}

/** Three-option definition quiz; distractors come from other words, order is stable per word. */
export function wordQuiz(w: Word): { options: string[]; answer: number } {
  const i = WORDS.indexOf(w);
  const others = [WORDS[(i + 7) % WORDS.length]!, WORDS[(i + 13) % WORDS.length]!].map((x) => x.definition);
  const answer = i % 3;
  const options = [...others];
  options.splice(answer, 0, w.definition);
  return { options, answer };
}

/** Spaced-repetition gaps (days) for words, by number of successful reviews. */
export const WORD_REVIEW_DAYS = [1, 3, 7, 21, 60];
