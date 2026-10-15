// COP17 volunteer teams (bilingual descriptions) and the calendar's constants. Capacity, minimum hours and
// applications live in the database (role_config / role_signups); this file holds what is only text.
import { getLang } from './i18n.js';

// The event runs 19–30 October 2026 (Yerevan). Slots are hourly: a slot's number is the hour it starts (08 = 08:00–09:00).
export const EVENT_DAYS = Array.from({ length: 12 }, (_, i) => `2026-10-${String(19 + i).padStart(2, '0')}`);
export const FIRST_HOUR = 8;
export const LAST_HOUR = 21;
export const HOURS = Array.from({ length: LAST_HOUR - FIRST_HOUR + 1 }, (_, i) => FIRST_HOUR + i);

const WEEKDAYS = { en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], hy: ['Կիր', 'Երկ', 'Երք', 'Չրք', 'Հնգ', 'Ուր', 'Շաբ'] };
export const dayParts = (day) => {
  const num = Number(day.slice(8));
  return { wd: WEEKDAYS[getLang()][new Date(`${day}T12:00:00Z`).getUTCDay()], num, long: getLang() === 'hy' ? `${num} հոկտ.` : `${num} Oct` };
};
export const hourLabel = (h) => `${String(h).padStart(2, '0')}:00`;

// Distinct, colour-blind-friendly team colours (also used for the calendar legend and cells).
export const TEAM_ORDER = ['media', 'event_coordination', 'rapporteur_green', 'content_dev', 'daily_recap', 'rapporteur', 'green_guides', 'promoters', 'coordinators', 'pavilion_coordinators'];

const T = (color, en, hy, tasksEn, tasksHy, noteEn, noteHy, extra = {}) => ({
  color, name: { en, hy }, tasks: { en: tasksEn, hy: tasksHy }, note: { en: noteEn, hy: noteHy }, ...extra,
});

const RAPPORTEUR_TASKS = {
  en: ['Listen carefully.', 'Capture the most important information.', 'Prepare a clear and accurate summary of the discussion.'],
  hy: ['Ուշադիր լսել։', 'Գրանցել ամենակարևոր տեղեկությունը։', 'Պատրաստել քննարկման հստակ և ճշգրիտ ամփոփագիր։'],
};
const RAPPORTEUR_EXTRA = {
  en: ['Rapporteurs are not expected to write down everything that is said. Focus on the main ideas, evidence, perspectives, disagreements, proposed solutions, and conclusions.',
    'Your notes may be used for event reports, university communications, COP17 summaries, or other materials after the event.'],
  hy: ['Զեկուցողներից չի պահանջվում գրի առնել ամեն ասվածը։ Կենտրոնացեք հիմնական գաղափարների, ապացույցների, տեսակետների, տարակարծությունների, առաջարկվող լուծումների և եզրակացությունների վրա։',
    'Ձեր նշումները կարող են օգտագործվել միջոցառման հաշվետվությունների, համալսարանական հաղորդագրությունների, COP17-ի ամփոփագրերի կամ միջոցառումից հետո այլ նյութերի համար։'],
};

export const TEAMS = {
  media: T('#d9622b', 'Media Team', 'Մեդիա թիմ',
    ['Taking photos and videos', 'Editing Reels'], ['Լուսանկարել և տեսանկարահանել', 'Մոնտաժել Reels-եր'], 'Be there', 'Պետք է ներկա լինել'),
  event_coordination: T('#1f77b4', 'Event Coordination Team', 'Միջոցառումների համակարգման թիմ',
    ['Ensure smooth event flow in the AUCB pavilion'], ['Ապահովել միջոցառումների սահուն ընթացքը ԿՀԲԿ տաղավարում'], 'Be there', 'Պետք է ներկա լինել'),
  rapporteur_green: T('#2e8b57', 'Rapporteurs Team (Green Zone)', 'Զեկուցողների թիմ (Կանաչ գոտի)',
    RAPPORTEUR_TASKS.en, RAPPORTEUR_TASKS.hy, '', '', { extra: RAPPORTEUR_EXTRA, rapporteur: true }),
  content_dev: T('#8e5bb5', 'Content Development Team', 'Բովանդակության մշակման թիմ',
    ['Generate Reel and Video ideas', 'Write content plan and ensure its implementation', 'Write posts'],
    ['Մշակել Reels-երի և տեսանյութերի գաղափարներ', 'Կազմել բովանդակության պլան և ապահովել դրա իրականացումը', 'Գրել գրառումներ'], 'Can be online', 'Կարելի է առցանց'),
  daily_recap: T('#c8a400', 'Daily Recap Team', 'Օրվա ամփոփման թիմ',
    ['Write daily summaries', 'Write daily summary reel scripts'], ['Գրել օրվա ամփոփագրեր', 'Գրել օրվա ամփոփման reel-երի սցենարներ'], 'Be there', 'Պետք է ներկա լինել'),
  rapporteur: T('#1a7f8e', 'Rapporteurs Team (Blue Zones)', 'Զեկուցողների թիմ (Կապույտ գոտիներ)',
    RAPPORTEUR_TASKS.en, RAPPORTEUR_TASKS.hy, 'Only if you have a blue zone accreditation', 'Միայն եթե ունեք կապույտ գոտու հավատարմագրում', { extra: RAPPORTEUR_EXTRA, rapporteur: true }),
  green_guides: T('#5aa02c', 'Green Zone Guides', 'Կանաչ գոտու ուղեկցորդներ',
    ['Guide and help Green Zone guests'], ['Ուղեկցել և օգնել Կանաչ գոտու հյուրերին'], 'Be there, with shifts', 'Պետք է ներկա լինել՝ հերթափոխերով'),
  promoters: T('#d6336c', 'Promoters’ Team', 'Տարածողների թիմ',
    ['Go around and tell people about the AUCB and its pavilion', 'Invite people to the pavilion', 'Do networking with people'],
    ['Շրջել և մարդկանց պատմել ԿՀԲԿ-ի ու նրա տաղավարի մասին', 'Հրավիրել մարդկանց տաղավար', 'Ծանոթություններ հաստատել մարդկանց հետ'], 'Be there, with shifts', 'Պետք է ներկա լինել՝ հերթափոխերով'),
  coordinators: T('#b5322d', 'Coordinators', 'Համակարգողներ',
    ['Ensure the smooth work of all the teams', 'Serve as direct contact points for all the ambassadors', 'Be in direct communication with Narek and Lia', 'Don’t overbother Lia and Narek',
      'Solve issues within the time and by yourself', 'Be independent', 'Make decisions', 'Take responsibility for fails and your own decision results'],
    ['Ապահովել բոլոր թիմերի սահուն աշխատանքը', 'Լինել բոլոր դեսպանների անմիջական կապի կետերը', 'Անմիջական կապ պահել Նարեկի և Լիայի հետ', 'Ավելորդ չանհանգստացնել Լիային և Նարեկին',
      'Խնդիրները լուծել ժամանակին և ինքնուրույն', 'Լինել ինքնուրույն', 'Որոշումներ կայացնել', 'Պատասխանատվություն կրել սխալների և սեփական որոշումների արդյունքների համար'],
    'Be THERE', 'Պետք է ԼԻՆԵԼ ՏԵՂՈՒՄ'),
  pavilion_coordinators: T('#4b5d8f', 'AUCB Pavilion Volunteer Coordinators', 'ԿՀԲԿ տաղավարի կամավորների համակարգողներ',
    ['Coordinate the volunteer groups of AUCB Pavilion', 'Work directly under the supervision of the AUCB Pavilion Coordinator'],
    ['Համակարգել ԿՀԲԿ տաղավարի կամավորական խմբերը', 'Աշխատել անմիջականորեն ԿՀԲԿ տաղավարի համակարգողի հսկողության ներքո'],
    'Can be online but should sometimes be there', 'Կարելի է առցանց, բայց երբեմն պետք է ներկա լինել'),
};

export const teamName = (key) => TEAMS[key]?.name[getLang()] || key;
export const teamColor = (key) => TEAMS[key]?.color || '#777';
export const isRapporteurTeam = (key) => !!TEAMS[key]?.rapporteur;
