// Display text and links for each activity. Rules (credits, category, kind) live in the database `activities` table.
export const ACTIVITY_TEXT = {
  inperson: { en: 'In-Person Introductory Training', hy: 'Ներածական դեմ առ դեմ ուսուցում' },
  unicef: { en: 'UNICEF Training Modules', hy: 'UNICEF-ի ուսուցողական մոդուլներ' },
  gybn_intl: {
    en: 'GYBN International Training', hy: 'GYBN միջազգային ուսուցում',
    url: 'https://us02web.zoom.us/meeting/register/8-tzlqmYSbq7FREyy2nmKA',
  },
  gybn_youth: {
    en: 'GYBN Youth Workshop', hy: 'GYBN երիտասարդական աշխատարան',
    url: 'https://newsroom.aua.am/2026/08/13/aua-acopian-center-partners-gybn-young-leaders-workshop-ahead-cop17/',
  },
  foracca: {
    en: 'AUA Acopian Center and WSL FORACCA Autumn School 2026',
    hy: 'ՀԱՀ Յակոբեան բնապահպանական կենտրոնի և WSL FORACCA-ի 2026 թ. աշնանային դպրոց',
    url: 'https://ace.aua.am/projects/foracca-collaboration/aua-acopian-center-and-wsl-foracca-2026-autumn-school/',
  },
  core_other: { en: 'Other (equivalent core training)', hy: 'Այլ (համարժեք հիմնական ուսուցում)' },
  bioblitz: { en: 'BioBlitz', hy: 'BioBlitz (կենսաբազմազանության արշավ)' },
  action_plan: {
    en: 'Workplace/Campus Biodiversity Action Plan (e.g., Biodiversity4AUA)',
    hy: 'Աշխատավայրի/համալսարանի կենսաբազմազանության գործողությունների պլան (օր.՝ Biodiversity4AUA)',
  },
  campaign: { en: 'Community Engagement Campaign', hy: 'Համայնքային ներգրավման արշավ' },
  elective_other: { en: 'Other (equivalent elective activity)', hy: 'Այլ (համարժեք ընտրովի գործունեություն)' },
  culture_comm: {
    en: 'Culture Partnership: Communication Course', hy: 'Culture Partnership․ հաղորդակցության դասընթաց',
    url: 'https://www.culturepartnership.eu/am/publishing/communication-course',
  },
  culture_digital_comm: {
    en: 'Culture Partnership: Digital Communication Course', hy: 'Culture Partnership․ թվային հաղորդակցության դասընթաց',
    url: 'https://www.culturepartnership.eu/am/publishing/digital-communication',
  },
  soft_other: { en: 'Other (equivalent soft skills course)', hy: 'Այլ (համարժեք փափուկ հմտությունների դասընթաց)' },
};

// Form options. Stored values are the keys; labels are looked up at display time.
export const SKILLS = [
  ['public_speaking', 'Public speaking', 'Հանրային ելույթ'], ['policy_advocacy', 'Policy advocacy', 'Քաղաքականության ջատագովություն'],
  ['media_creation', 'Media content creation', 'Մեդիա բովանդակության ստեղծում'], ['social_media', 'Social media management', 'Սոցիալական ցանցերի կառավարում'],
  ['photography', 'Photography', 'Լուսանկարչություն'], ['video', 'Video production & editing', 'Տեսաձայնագրում և մոնտաժ'],
  ['graphic_design', 'Graphic design', 'Գրաֆիկական դիզայն'], ['research', 'Scientific research', 'Գիտական հետազոտություն'],
  ['data_analysis', 'Data analysis', 'Տվյալների վերլուծություն'], ['gis', 'GIS & mapping', 'GIS և քարտեզագրում'],
  ['field_ecology', 'Field ecology & species ID', 'Դաշտային էկոլոգիա և տեսակների որոշում'], ['event_organizing', 'Event organizing', 'Միջոցառումների կազմակերպում'],
  ['community_organizing', 'Community organizing', 'Համայնքային կազմակերպում'], ['project_management', 'Project management', 'Նախագծերի կառավարում'],
  ['grant_writing', 'Grant writing & fundraising', 'Դրամաշնորհային հայտեր և միջոցների հայթայթում'], ['teaching', 'Teaching & facilitation', 'Ուսուցում և դասավանդում'],
  ['translation', 'Translation & interpreting', 'Թարգմանություն և բանավոր թարգմանություն'], ['writing', 'Writing & editing', 'Գրավոր խոսք և խմբագրում'],
  ['leadership', 'Leadership', 'Առաջնորդություն'], ['teamwork', 'Teamwork & coordination', 'Թիմային աշխատանք և համակարգում'],
  ['volunteer_mgmt', 'Volunteer management', 'Կամավորների կառավարում'], ['diplomacy', 'Diplomacy & protocol', 'Դիվանագիտություն և արարողակարգ'],
].map(([key, en, hy]) => ({ key, en, hy }));

export const LANGUAGES = [
  ['hy', 'Armenian', 'Հայերեն'], ['en', 'English', 'Անգլերեն'], ['ru', 'Russian', 'Ռուսերեն'], ['fr', 'French', 'Ֆրանսերեն'],
  ['de', 'German', 'Գերմաներեն'], ['es', 'Spanish', 'Իսպաներեն'], ['it', 'Italian', 'Իտալերեն'], ['fa', 'Persian', 'Պարսկերեն'],
  ['ar', 'Arabic', 'Արաբերեն'], ['ka', 'Georgian', 'Վրացերեն'], ['tr', 'Turkish', 'Թուրքերեն'], ['zh', 'Chinese', 'Չինարեն'],
  ['pt', 'Portuguese', 'Պորտուգալերեն'], ['pl', 'Polish', 'Լեհերեն'], ['uk', 'Ukrainian', 'Ուկրաիներեն'],
].map(([key, en, hy]) => ({ key, en, hy }));

export const PROFICIENCY = [
  ['basic', 'Basic', 'Հիմնական'], ['intermediate', 'Intermediate', 'Միջին'], ['advanced', 'Advanced', 'Առաջադեմ'],
  ['fluent', 'Fluent', 'Ազատ'], ['native', 'Native', 'Մայրենի'],
].map(([key, en, hy]) => ({ key, en, hy }));

// AUCB member universities. Stored in English so filtering and audience selection stay language-independent.
export const UNIVERSITIES = [
  ['Yerevan State University', 'Երևանի պետական համալսարան'],
  ['American University of Armenia', 'Հայաստանի ամերիկյան համալսարան'],
  ['French University in Armenia', 'Հայաստանում ֆրանսիական համալսարան'],
  ['Armenian State University of Economics', 'Հայաստանի պետական տնտեսագիտական համալսարան'],
  ['National Polytechnic University of Armenia', 'Հայաստանի ազգային պոլիտեխնիկական համալսարան'],
  ['Armenian National Agrarian University', 'Հայաստանի ազգային ագրարային համալսարան'],
  ['Goris State University', 'Գորիսի պետական համալսարան'],
  ['Gavar State University', 'Գավառի պետական համալսարան'],
  ['Shirak State University', 'Շիրակի պետական համալսարան'],
  ['Armenian State Pedagogical University', 'Հայկական պետական մանկավարժական համալսարան'],
  ['Yerevan State Institute of Theatre and Cinematography', 'Երևանի թատրոնի և կինոյի պետական ինստիտուտ'],
  ['Russian-Armenian University', 'Ռուս-հայկական համալսարան'],
  ['Eurasia International University', 'Եվրասիա միջազգային համալսարան'],
  ['Public Administration Academy of the Republic of Armenia', 'ՀՀ պետական կառավարման ակադեմիա'],
  ['State Academy of Fine Arts of Armenia', 'Հայաստանի գեղարվեստի պետական ակադեմիա'],
].map(([en, hy]) => ({ key: en, en, hy }));
