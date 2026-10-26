
const SUPABASE_URL = 'https://fkddvxgfiuwxxrpqytlc.supabase.co';


const SUPABASE_KEY = 'sb_publishable_R2NcB2bjmyzWV3Xyu0xYYQ_Itd3AkBQ';

const START_HOUR = 10;
const END_HOUR = 20;

// Подключение к базе. Дальше в коде база называется db
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
