import 'server-only';
import { querySource } from '@/lib/db/source';
import { investorProfile, searchInvestors, type InvestorHit, type InvestorProfile } from './investor-profile';
import type { Row } from './sql-filters';

const q = (sql: string, params?: unknown[]) => querySource<Row>(sql, params);

/** Not cached: a profile is opened on demand and should be current. */
export const getInvestorProfile = (userId: number): Promise<InvestorProfile | null> => investorProfile(q, userId, new Date());
export const searchInvestorsLive = (term: string): Promise<InvestorHit[]> => searchInvestors(q, term);
