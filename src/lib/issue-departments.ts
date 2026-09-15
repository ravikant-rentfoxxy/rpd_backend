/** Issue category → departments + X handles for grievance posts. */
export const ISSUE_DEPARTMENTS: Record<
  string,
  { departments: string[]; handles: string[] }
> = {
  LAND: {
    departments: ['Revenue / Tehsil', 'Board of Revenue'],
    handles: ['@CMOfficeUP', '@UPGovt', '@CollectorOffice'],
  },
  WATER: {
    departments: ['Jal Jeevan Mission', 'UP Jal Nigam', 'Gram Panchayat'],
    handles: ['@JalShaktiGoI', '@CMOfficeUP', '@UPGovt'],
  },
  POWER: {
    departments: ['UP Power Corporation (UPPCL)', 'Electricity Distribution'],
    handles: ['@UPPCLOfficial', '@CMOfficeUP', '@UPGovt'],
  },
  ROAD_SANITATION: {
    departments: ['PWD', 'Rural Development', 'Nagar Nigam / Panchayat'],
    handles: ['@UttarPradeshPWD', '@MoRD_GoI', '@CMOfficeUP', '@UPGovt'],
  },
  RATION: {
    departments: ['Food & Civil Supplies', 'Fair Price Shop administration'],
    handles: ['@FoodDepttGoI', '@CMOfficeUP', '@UPGovt'],
  },
  PENSION: {
    departments: ['Social Welfare', 'Pension disbursement'],
    handles: ['@MSJEGOI', '@CMOfficeUP', '@UPGovt'],
  },
  NREGA: {
    departments: ['Rural Development', 'MGNREGA'],
    handles: ['@MoRD_GoI', '@CMOfficeUP', '@UPGovt'],
  },
  HOUSING: {
    departments: ['Rural Housing / PMAY', 'Swachh Bharat (toilets)'],
    handles: ['@MoHUA_India', '@PMAYUrban', '@swachhbharat', '@CMOfficeUP'],
  },
  HEALTH: {
    departments: ['Health Department', 'NHM / District Hospital'],
    handles: ['@MoHFW_INDIA', '@UPHealthDept', '@CMOfficeUP', '@UPGovt'],
  },
  EDUCATION: {
    departments: ['Basic Education', 'Anganwadi / WCD'],
    handles: ['@EduMinOfIndia', '@CMOfficeUP', '@UPGovt'],
  },
  FARMING: {
    departments: ['Agriculture', 'Irrigation', 'Mandi Parishad'],
    handles: ['@AgriGoI', '@CMOfficeUP', '@UPGovt'],
  },
  DOCUMENTS: {
    departments: ['Tehsil / SDM office', 'Aadhaar / UIDAI'],
    handles: ['@UIDAI', '@CMOfficeUP', '@UPGovt'],
  },
  COMMON_PROPERTY: {
    departments: ['Gram Panchayat', 'Revenue'],
    handles: ['@MoRD_GoI', '@CMOfficeUP', '@UPGovt'],
  },
  GOVERNANCE: {
    departments: ['District Administration', 'Police / Local body'],
    handles: ['@CMOfficeUP', '@UPGovt', '@Uppolice'],
  },
};

export function departmentsForIssue(issueCode?: string | null) {
  const code = (issueCode ?? '').trim().toUpperCase();
  if (!code) return null;
  if (ISSUE_DEPARTMENTS[code]) return ISSUE_DEPARTMENTS[code];
  const parent = code.split('_')[0];
  // Sub-issue codes like HANDPUMP_BROKEN won't match; try parent from known keys via prefix
  for (const key of Object.keys(ISSUE_DEPARTMENTS)) {
    if (code.startsWith(key) || key.startsWith(code)) return ISSUE_DEPARTMENTS[key];
  }
  // Map common sub-prefixes to parent categories
  const prefixMap: Record<string, string> = {
    LAND: 'LAND',
    HANDPUMP: 'WATER',
    WATER: 'WATER',
    PIPELINE: 'WATER',
    TANK: 'WATER',
    TRANSFORMER: 'POWER',
    POLE: 'POWER',
    NO_SUPPLY: 'POWER',
    WRONG_BILL: 'POWER',
    NEW_CONNECTION: 'POWER',
    STREET: 'POWER',
    ROAD: 'ROAD_SANITATION',
    KHARANJA: 'ROAD_SANITATION',
    DRAIN: 'ROAD_SANITATION',
    WATERLOGGING: 'ROAD_SANITATION',
    GARBAGE: 'ROAD_SANITATION',
    CULVERT: 'ROAD_SANITATION',
    RATION: 'RATION',
    NAME_MISSING: 'RATION',
    CARD: 'RATION',
    LESS_GRAIN: 'RATION',
    DEALER: 'RATION',
    EKYC: 'RATION',
    OLD_AGE: 'PENSION',
    WIDOW: 'PENSION',
    DISABILITY: 'PENSION',
    PENSION: 'PENSION',
    BANK: 'PENSION',
    JOB: 'NREGA',
    WAGE: 'NREGA',
    MUSTER: 'NREGA',
    WORK: 'NREGA',
    AWAS: 'HOUSING',
    TOILET: 'HOUSING',
    LIST_WRONG: 'HOUSING',
    PHC: 'HEALTH',
    NO_MEDICINE: 'HEALTH',
    ASHA: 'HEALTH',
    AMBULANCE: 'HEALTH',
    AYUSHMAN: 'HEALTH',
    VACCINATION: 'HEALTH',
    TEACHER: 'EDUCATION',
    SCHOOL: 'EDUCATION',
    MID_DAY: 'EDUCATION',
    ANGANWADI: 'EDUCATION',
    SCHOLARSHIP: 'EDUCATION',
    ADMISSION: 'EDUCATION',
    CANAL: 'FARMING',
    TUBEWELL: 'FARMING',
    FERTILIZER: 'FARMING',
    CROP: 'FARMING',
    STRAY: 'FARMING',
    MANDI: 'FARMING',
    CASTE: 'DOCUMENTS',
    INCOME: 'DOCUMENTS',
    RESIDENCE: 'DOCUMENTS',
    BIRTH: 'DOCUMENTS',
    AADHAAR: 'DOCUMENTS',
    POND: 'COMMON_PROPERTY',
    GRAZING: 'COMMON_PROPERTY',
    CREMATION: 'COMMON_PROPERTY',
    PANCHAYAT: 'COMMON_PROPERTY',
    PLAYGROUND: 'COMMON_PROPERTY',
  };
  for (const [prefix, parentKey] of Object.entries(prefixMap)) {
    if (code.startsWith(prefix)) return ISSUE_DEPARTMENTS[parentKey] ?? null;
  }
  void parent;
  return null;
}
