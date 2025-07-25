import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { dbHelpers } from '../lib/supabase';
import { supabase } from '../lib/supabase';
import { format, subDays, isToday, parseISO, differenceInDays } from 'date-fns';
import toast from 'react-hot-toast';

// TypeScript interfaces for DSA context
export interface Problem {
  id: string;
  title: string;
  difficulty: string;
  topic: string;
  description?: string;
  external_url?: string;
  leetcode_number?: number;
  company_tags?: string[];
  pattern_tags?: string[];
  xp_reward: number;
  estimated_time_minutes?: number;
  hints?: string[];
  status?: string;
  is_bookmarked?: boolean;
  is_interview_ready?: boolean;
  completed_at?: string;
  confidence_level?: number;
  personal_notes?: string;
  approach_notes?: string;
  key_insights?: string;
  last_revised_at?: string;
  [key: string]: any;
}

export interface UserProblem extends Problem {
  // Add any user-specific fields if needed
}

export interface DailyProgress {
  solved: number;
  revised: number;
  goal: number;
  revisionGoal: number;
  achieved: boolean;
  revisionAchieved: boolean;
  xpEarned: number;
  studyTime: number;
  focusAreas: string[];
  notes?: string;
}

export interface Badge {
  type: string;
  name: string;
  description: string;
  icon: string;
  id?: string;
  unlocked?: boolean;
  unlockedAt?: string;
  [key: string]: any; // Allow badge_type and other fields
}

export interface CodeSnippet {
  id: string;
  problem_id: string;
  code: string;
  language: string;
  created_at: string;
  is_solution?: boolean;
  notes?: string;
}

export interface RevisionSession {
  id?: string;
  session_type: string;
  problems_revised: string[];
  confidence_before: number;
  topics_covered: string[];
  notes?: string;
  created_at?: string;
}

export interface Streak {
  current: number;
  longest: number;
}

export interface DSAContextType {
  problems: Problem[];
  userProblems: UserProblem[];
  dailyProgress: Record<string, DailyProgress>;
  userBadges: Badge[];
  codeSnippets: Record<string, CodeSnippet[]>;
  revisionSessions: RevisionSession[];
  loading: boolean;
  streak: Streak;
  dailyGoal: number;
  revisionGoal: number;
  setRevisionGoal: (goal: number) => void;
  loadAllData: (forceRefresh?: boolean) => Promise<void>;
  loadProblems: () => Promise<void>;
  loadUserProblems: () => Promise<void>;
  loadDailyProgress: () => Promise<void>;
  loadUserBadges: () => Promise<void>;
  loadRevisionSessions: () => Promise<void>;
  updateProblemStatus: (problemId: string, status: string, additionalData?: any) => Promise<void>;
  createProblem: (problemData: Problem) => Promise<void>;
  updateProblem: (problemId: string, updates: Partial<Problem>) => Promise<void>;
  markForRevision: (problemId: string, revisionNotes?: string) => Promise<void>;
  toggleBookmark: (problemId: string, isBookmarked: boolean) => Promise<void>;
  updateConfidenceLevel: (problemId: string, confidenceLevel: number) => Promise<void>;
  updateTodayProgress: () => Promise<void>;
  updateDailyGoal: (newGoal: number) => Promise<void>;
  checkBadgeUnlocks: () => Promise<void>;
  saveCodeSnippet: (problemId: string, codeData: any) => Promise<void>;
  loadCodeSnippets: (problemId: string) => Promise<void>;
  createRevisionSession: (sessionData: RevisionSession) => Promise<void>;
  deleteProblem: (problemId: string) => Promise<void>;
  getTodayProgress: () => DailyProgress | undefined;
  getStats: () => any;
  getRevisionInsights: () => any;
  getMotivationalMessage: () => string;
  resetData: () => void;
  hasLoadedOnce: boolean;
}

const DSAContext = createContext<DSAContextType | undefined>(undefined);

export const useDSA = (): DSAContextType => {
  const context = useContext(DSAContext);
  if (!context) {
    throw new Error('useDSA must be used within a DSAProvider');
  }
  return context;
};

const badgeDefinitions = [
  { type: 'first_problem', name: 'First Steps', description: 'Solved your first problem!', icon: '🎯' },
  { type: 'streak_7', name: 'Week Warrior', description: '7-day streak achieved!', icon: '🔥' },
  { type: 'streak_30', name: 'Monthly Master', description: '30-day streak achieved!', icon: '🏆' },
  { type: 'revision_master', name: 'Revision Master', description: 'Revised 50 problems!', icon: '📚' },
  { type: 'interview_ready', name: 'Interview Ready', description: '20 problems marked interview-ready!', icon: '💼' },
  { type: 'confidence_builder', name: 'Confidence Builder', description: 'High confidence on 30 problems!', icon: '💪' },
  { type: 'xp_100', name: '100 XP Club', description: 'Earned 100 XP!', icon: '⭐' },
  { type: 'xp_500', name: '500 XP Hero', description: 'Earned 500 XP!', icon: '💎' },
  { type: 'xp_1000', name: '1000 XP Legend', description: 'Earned 1000 XP!', icon: '👑' },
  { type: 'easy_10', name: 'Easy Explorer', description: 'Solved 10 easy problems!', icon: '🌱' },
  { type: 'medium_10', name: 'Medium Challenger', description: 'Solved 10 medium problems!', icon: '⚡' },
  { type: 'hard_5', name: 'Hard Conqueror', description: 'Solved 5 hard problems!', icon: '🗡️' },
  { type: 'topic_master', name: 'Topic Master', description: 'Completed all problems in a topic!', icon: '🎓' },
  { type: 'bookworm', name: 'Bookworm', description: 'Bookmarked 25 problems!', icon: '📖' },
  { type: 'code_collector', name: 'Code Collector', description: 'Saved 50 code snippets!', icon: '💻' }
];

export const DSAProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, userProfile } = useAuth() as { user: { id: string } | null, userProfile: { daily_goal?: number } | null };
  const [problems, setProblems] = useState<Problem[]>([]);
  const [userProblems, setUserProblems] = useState<UserProblem[]>([]);
  const [dailyProgress, setDailyProgress] = useState<Record<string, DailyProgress>>({});
  const [userBadges, setUserBadges] = useState<Badge[]>([]);
  const [codeSnippets, setCodeSnippets] = useState<Record<string, CodeSnippet[]>>({});
  const [revisionSessions, setRevisionSessions] = useState<RevisionSession[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [streak, setStreak] = useState<Streak>({ current: 0, longest: 0 });
  const [dailyGoal, setDailyGoal] = useState<number>(1);
  const [revisionGoal, setRevisionGoal] = useState<number>(0);
  const [hasLoadedOnce, setHasLoadedOnce] = useState<boolean>(false);

  // Load data when user changes
  useEffect(() => {
    if (user) {
      loadAllData();
    } else {
      resetData();
    }
  }, [user]);

  // Update daily goal when user profile changes
  useEffect(() => {
    if (userProfile?.daily_goal) {
      setDailyGoal(userProfile.daily_goal);
    }
  }, [userProfile]);

  const resetData = () => {
    setProblems([]);
    setUserProblems([]);
    setDailyProgress({});
    setUserBadges([]);
    setCodeSnippets({});
    setRevisionSessions([]);
    setStreak({ current: 0, longest: 0 });
    setLoading(false);
    setHasLoadedOnce(false);
  };

  const loadAllData = async (forceRefresh: boolean = false) => {
    if (!user) return;

    // Only set loading to true if data is not loaded yet or forceRefresh is true
    if (!hasLoadedOnce || forceRefresh) {
    setLoading(true);
    }
    try {
      await Promise.all([
        loadProblems(),
        loadUserProblems(),
        loadDailyProgress(),
        loadUserBadges(),
        loadRevisionSessions()
      ]);
      setHasLoadedOnce(true);
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const loadProblems = async (): Promise<void> => {
    try {
      // Check if user has created any problems
      let userCreatedCount = 0;
      if (user) {
        const { count, error } = await supabase
          .from('problems')
          .select('id', { count: 'exact', head: true })
          .eq('created_by', user.id)
          .eq('is_active', true);
        if (!error) userCreatedCount = count ?? 0;
      }
      
      let data: Problem[] = [];
      if (userCreatedCount > 0) {
        data = await dbHelpers.getProblems({ userId: user!.id });
      } else {
        // Load example problems with proper error handling
        try {
          data = await dbHelpers.getProblems({ onlyExamples: true });
        } catch (exampleError) {
          console.warn('No example problems found, creating empty array');
          data = [];
        }
      }
      
      setProblems(data || []);
    } catch (error) {
      console.error('Error loading problems:', error);
      setProblems([]); // Set empty array on error
    }
  };

  const loadUserProblems = async (): Promise<void> => {
    if (!user) return;

    try {
      const data: UserProblem[] = await dbHelpers.getUserProblems(user.id);
      setUserProblems(data || []);
    } catch (error) {
      console.error('Error loading user problems:', error);
      setUserProblems([]);
    }
  };

  const loadDailyProgress = async (): Promise<void> => {
    if (!user) return;

    try {
      const startDate = format(subDays(new Date(), 90), 'yyyy-MM-dd');
      const endDate = format(new Date(), 'yyyy-MM-dd');
      const data = await dbHelpers.getDailyProgress(user.id, startDate, endDate);
      const progressMap: Record<string, DailyProgress> = {};
      data.forEach((progress: any) => {
        progressMap[progress.date] = {
          solved: progress.problems_solved,
          revised: progress.problems_revised,
          goal: progress.daily_goal,
          revisionGoal: progress.revision_goal,
          achieved: progress.goal_achieved,
          revisionAchieved: progress.revision_goal_achieved,
          xpEarned: progress.xp_earned,
          studyTime: progress.study_time_minutes,
          focusAreas: progress.focus_areas || [],
          notes: progress.notes
        };
      });
      setDailyProgress(progressMap);
      calculateStreak(progressMap);
    } catch (error) {
      console.error('Error loading daily progress:', error);
      setDailyProgress({});
    }
  };

  const loadUserBadges = async () => {
    if (!user) return;

    try {
      const data = await dbHelpers.getUserBadges(user.id);
      const badgesWithStatus = badgeDefinitions.map(badge => {
        const unlocked = data.find((ub: any) => ub.badge_type === badge.type);
        return {
          ...badge,
          id: badge.type,
          unlocked: !!unlocked,
          unlockedAt: unlocked?.unlocked_at
        };
      });
      setUserBadges(badgesWithStatus);
    } catch (error) {
      console.error('Error loading user badges:', error);
      setUserBadges([]);
    }
  };

  const loadRevisionSessions = async () => {
    if (!user) return;

    try {
      const data = await dbHelpers.getRevisionSessions(user.id);
      setRevisionSessions(data || []);
    } catch (error) {
      console.error('Error loading revision sessions:', error);
      setRevisionSessions([]);
    }
  };

  const calculateStreak = (progressData: Record<string, DailyProgress>): void => {
    const today = new Date();
    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;

    // Sort dates in descending order
    const sortedDates = Object.keys(progressData).sort((a, b) => {
      if (typeof a === 'string' && typeof b === 'string') {
        return new Date(b).getTime() - new Date(a).getTime();
      }
      return 0;
    });

    // Calculate current streak
    for (let i = 0; i < sortedDates.length; i++) {
      const date = sortedDates[i];
      const daysDiff = differenceInDays(today, parseISO(date));
      
      if (progressData[date] && progressData[date].achieved) {
        if (daysDiff === i) {
          currentStreak++;
        } else {
          break;
        }
      } else {
        break;
      }
    }

    // Calculate longest streak
    for (const date of sortedDates) {
      if (progressData[date] && progressData[date].achieved) {
        tempStreak++;
        longestStreak = Math.max(longestStreak, tempStreak);
      } else {
        tempStreak = 0;
      }
    }

    setStreak({ current: currentStreak, longest: longestStreak });
  };

  const updateProblemStatus = async (problemId: string, status: string, additionalData: any = {}): Promise<void> => {
    if (!user) return;

    try {
      await dbHelpers.updateUserProblemStatus(user.id, problemId, status, additionalData);
      await loadUserProblems();

      // Update daily progress if problem is completed or revised
      if (status === 'Done' || status === 'Needs Revision') {
        await updateTodayProgress();
        await checkBadgeUnlocks();
      }

      toast.success(`Problem marked as ${status.toLowerCase()}`);
    } catch (error) {
      console.error('Error updating problem status:', error);
      toast.error('Failed to update problem status');
    }
  };

  const createProblem = async (problemData: Problem): Promise<void> => {
    if (!user) return;

    try {
      const newProblem = await dbHelpers.createProblem({
        ...problemData,
        created_by: user.id
      });
      await loadProblems();
      return newProblem;
    } catch (error) {
      console.error('Error creating problem:', error);
      throw error;
    }
  };

  const updateProblem = async (problemId: string, updates: Partial<Problem>): Promise<void> => {
    if (!user) return;

    try {
      const updatedProblem = await dbHelpers.updateProblem(problemId, updates);
      await loadProblems();
      return updatedProblem;
    } catch (error) {
      console.error('Error updating problem:', error);
      throw error;
    }
  };

  const markForRevision = async (problemId: string, revisionNotes: string = ''): Promise<void> => {
    if (!user) return;

    try {
      await dbHelpers.markForRevision(user.id, problemId, revisionNotes);
      await loadUserProblems();
      await updateTodayProgress();
      toast.success('Problem marked for revision');
    } catch (error) {
      console.error('Error marking for revision:', error);
      toast.error('Failed to mark for revision');
    }
  };

  const toggleBookmark = async (problemId: string, isBookmarked: boolean): Promise<void> => {
    if (!user) return;

    try {
      await dbHelpers.toggleBookmark(user.id, problemId, isBookmarked);
      await loadUserProblems();
      toast.success(isBookmarked ? 'Problem bookmarked' : 'Bookmark removed');
    } catch (error) {
      console.error('Error toggling bookmark:', error);
      toast.error('Failed to update bookmark');
    }
  };

  const updateConfidenceLevel = async (problemId: string, confidenceLevel: number): Promise<void> => {
    if (!user) return;

    try {
      await dbHelpers.updateConfidenceLevel(user.id, problemId, confidenceLevel);
      await loadUserProblems();
      toast.success('Confidence level updated');
    } catch (error) {
      console.error('Error updating confidence level:', error);
      toast.error('Failed to update confidence level');
    }
  };

  const updateTodayProgress = async (): Promise<void> => {
    if (!user || !userProfile) return;

    const today = format(new Date(), 'yyyy-MM-dd');
    const solvedToday = userProblems.filter(p => 
      p.status === 'Done' && 
      p.completed_at && 
      format(parseISO(p.completed_at as string), 'yyyy-MM-dd') === today
    ).length;

    const revisedToday = userProblems.filter(p => 
      p.last_revised_at && 
      format(parseISO(p.last_revised_at), 'yyyy-MM-dd') === today
    ).length;

    const goalAchieved = solvedToday >= (userProfile?.daily_goal ?? 0);
    const revisionGoalAchieved = revisedToday >= (revisionGoal || 0);
    
    const xpEarned = userProblems
      .filter(p => 
        p.status === 'Done' && 
        p.completed_at && 
        format(parseISO(p.completed_at as string), 'yyyy-MM-dd') === today
      )
      .reduce((sum, p) => sum + (p.xp_reward || 0), 0);

    try {
      await dbHelpers.updateDailyProgress(user.id, today, {
        problems_solved: solvedToday,
        problems_revised: revisedToday,
        daily_goal: userProfile.daily_goal,
        revision_goal: revisionGoal || 0,
        goal_achieved: goalAchieved,
        revision_goal_achieved: revisionGoalAchieved,
        xp_earned: xpEarned,
        streak_count: goalAchieved ? streak.current + 1 : 0
      });

      await loadDailyProgress();
    } catch (error) {
      console.error('Error updating daily progress:', error);
    }
  };

  const updateDailyGoal = async (newGoal: number): Promise<void> => {
    if (!user || !userProfile) return;

    try {
      // Update user profile with new daily goal
      await dbHelpers.updateUserProfile(user.id, { daily_goal: newGoal });
      setDailyGoal(newGoal);
      
      // Update today's progress with new goal
      await updateTodayProgress();
      
      toast.success(`Daily goal updated to ${newGoal} problems`);
    } catch (error) {
      console.error('Error updating daily goal:', error);
      toast.error('Failed to update daily goal');
    }
  };

  const checkBadgeUnlocks = async (): Promise<void> => {
    if (!user) return;

    const solvedProblems = userProblems.filter(p => p.status === 'Done');
    const revisedProblems = userProblems.filter(p => p.revision_count > 0);
    const interviewReadyProblems = userProblems.filter(p => p.is_interview_ready);
    const bookmarkedProblems = userProblems.filter(p => p.is_bookmarked);
    const highConfidenceProblems = userProblems.filter(p => (typeof p.confidence_level === 'number' ? p.confidence_level : 0) >= 4);
    
    const totalXP = solvedProblems.reduce((sum, p) => sum + (p.xp_reward || 0), 0);
    const easyCount = solvedProblems.filter(p => p.difficulty === 'Easy').length;
    const mediumCount = solvedProblems.filter(p => p.difficulty === 'Medium').length;
    const hardCount = solvedProblems.filter(p => p.difficulty === 'Hard').length;

    const badgesToUnlock = [];

    // Check each badge condition
    for (const badge of badgeDefinitions) {
      const alreadyUnlocked = userBadges.some(ub => ub.badge_type === badge.type && ub.unlocked);
      if (alreadyUnlocked) continue;

      let shouldUnlock = false;

      switch (badge.type) {
        case 'first_problem':
          shouldUnlock = solvedProblems.length >= 1;
          break;
        case 'streak_7':
          shouldUnlock = streak.current >= 7;
          break;
        case 'streak_30':
          shouldUnlock = streak.current >= 30;
          break;
        case 'revision_master':
          shouldUnlock = revisedProblems.length >= 50;
          break;
        case 'interview_ready':
          shouldUnlock = interviewReadyProblems.length >= 20;
          break;
        case 'confidence_builder':
          shouldUnlock = highConfidenceProblems.length >= 30;
          break;
        case 'xp_100':
          shouldUnlock = totalXP >= 100;
          break;
        case 'xp_500':
          shouldUnlock = totalXP >= 500;
          break;
        case 'xp_1000':
          shouldUnlock = totalXP >= 1000;
          break;
        case 'easy_10':
          shouldUnlock = easyCount >= 10;
          break;
        case 'medium_10':
          shouldUnlock = mediumCount >= 10;
          break;
        case 'hard_5':
          shouldUnlock = hardCount >= 5;
          break;
        case 'bookworm':
          shouldUnlock = bookmarkedProblems.length >= 25;
          break;
        case 'code_collector':
          shouldUnlock = Object.values(codeSnippets).flat().length >= 50;
          break;
        case 'topic_master':
          // Check if any topic is completed
          const topics = [...new Set(problems.map(p => p.topic))];
          shouldUnlock = topics.some(topic => {
            const topicProblems = problems.filter(p => p.topic === topic);
            const topicSolved = solvedProblems.filter(p => p.topic === topic);
            return topicSolved.length === topicProblems.length && topicProblems.length > 0;
          });
          break;
      }

      if (shouldUnlock) {
        badgesToUnlock.push({
          badge_type: badge.type,
          badge_name: badge.name,
          badge_description: badge.description,
          badge_icon: badge.icon
        });
      }
    }

    // Unlock badges
    for (const badge of badgesToUnlock) {
      try {
        await dbHelpers.unlockBadge(user.id, badge);
        toast.success(`🎉 Badge unlocked: ${badge.badge_name}!`);
      } catch (error) {
        console.error('Error unlocking badge:', error);
      }
    }

    if (badgesToUnlock.length > 0) {
      await loadUserBadges();
    }
  };

  const saveCodeSnippet = async (problemId: string, codeData: any): Promise<void> => {
    if (!user) return;

    try {
      const snippet = await dbHelpers.saveCodeSnippet(user.id, problemId, codeData);
      
      // Update local state
      setCodeSnippets(prev => ({
        ...prev,
        [problemId]: [...(prev[problemId] || []), snippet]
      }));

      toast.success('Code snippet saved!');
      return snippet;
    } catch (error) {
      console.error('Error saving code snippet:', error);
      toast.error('Failed to save code snippet');
      throw error;
    }
  };

  const loadCodeSnippets = async (problemId: string): Promise<void> => {
    if (!user) return;
    try {
      const data = await dbHelpers.getCodeSnippets(user.id, problemId);
      setCodeSnippets(prev => ({ ...prev, [problemId]: data || [] }));
    } catch (error) {
      console.error('Error loading code snippets:', error);
      setCodeSnippets(prev => ({ ...prev, [problemId]: [] }));
    }
  };

  const createRevisionSession = async (sessionData: RevisionSession): Promise<void> => {
    if (!user) return;
    try {
      await dbHelpers.createRevisionSession(user.id, sessionData);
      await loadRevisionSessions();
      toast.success('Revision session started!');
    } catch (error) {
      console.error('Error creating revision session:', error);
      toast.error('Failed to start revision session');
    }
  };

  /**
   * Archive (soft-delete) a problem by setting is_active to false.
   * Only the owner (created_by) can perform this action.
   * Returns the updated problem row.
   * @param {string} problemId - The ID of the problem to archive.
   */
  const deleteProblem = async (problemId: string): Promise<void> => {
    if (!user) return;
    try {
      await dbHelpers.deleteProblem(user.id, problemId);
      await loadProblems();
      await loadUserProblems();
      toast.success('Problem archived successfully!');
    } catch (error) {
      console.error('Error archiving problem:', error);
      toast.error('Failed to archive problem');
    }
  };

  const getTodayProgress = () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const progress = dailyProgress[today];
    
    return {
      solved: progress?.solved || 0,
      revised: progress?.revised || 0,
      goal: userProfile?.daily_goal || dailyGoal,
      revisionGoal: progress?.revisionGoal || revisionGoal,
      achieved: progress?.achieved || false,
      revisionAchieved: progress?.revisionAchieved || false,
      xpEarned: progress?.xpEarned || 0,
      studyTime: progress?.studyTime || 0,
      focusAreas: progress?.focusAreas || [],
      notes: progress?.notes || ''
    };
  };

  const getStats = () => {
    const solvedProblems = userProblems.filter(p => p.status === 'Done');
    const revisedProblems = userProblems.filter(p => p.revision_count > 0);
    const interviewReadyProblems = userProblems.filter(p => p.is_interview_ready);
    const bookmarkedProblems = userProblems.filter(p => p.is_bookmarked);
    
    const totalXP = solvedProblems.reduce((sum, p) => sum + (p.xp_reward || 0), 0);
    const level = Math.floor(totalXP / 100) + 1;
    const xpToNextLevel = 100 - (totalXP % 100);
    
    return {
      totalProblems: problems.length,
      solvedProblems: solvedProblems.length,
      revisedProblems: revisedProblems.length,
      interviewReadyProblems: interviewReadyProblems.length,
      bookmarkedProblems: bookmarkedProblems.length,
      totalXP,
      level,
      xpToNextLevel,
      progressPercentage: problems.length > 0 ? Math.round((solvedProblems.length / problems.length) * 100) : 0,
      averageConfidence: userProblems.length > 0 
        ? Math.round(userProblems.reduce((sum, p) => sum + (p.confidence_level || 1), 0) / userProblems.length * 10) / 10
        : 0
    };
  };

  const getRevisionInsights = () => {
    const needsRevision = userProblems.filter(p => 
      p.status === 'Needs Revision' || (typeof p.confidence_level === 'number' ? p.confidence_level : 0) <= 3
    );
    
    const recentlyRevised = userProblems
      .filter(p => p.last_revised_at)
      .sort((a, b) => {
        const aDate = typeof a.last_revised_at === 'string' ? new Date(a.last_revised_at) : new Date(0);
        const bDate = typeof b.last_revised_at === 'string' ? new Date(b.last_revised_at) : new Date(0);
        return bDate.getTime() - aDate.getTime();
      })
      .slice(0, 10);

    const topicWeaknesses: { [topic: string]: number } = {};
    needsRevision.forEach(p => {
      topicWeaknesses[p.topic] = (topicWeaknesses[p.topic] || 0) + 1;
    });

    return {
      needsRevision: needsRevision.length,
      recentlyRevised,
      topicWeaknesses: Object.entries(topicWeaknesses)
        .sort(([,a], [,b]) => (typeof b === 'number' && typeof a === 'number' ? b - a : 0))
        .slice(0, 5)
    };
  };

  const getMotivationalMessage = () => {
    const todayProgress = getTodayProgress();
    const stats = getStats();
    
    const motivationalQuotes = [
      "Every expert was once a beginner. Keep coding! 💪",
      "The only way to do great work is to love what you do. 🚀",
      "Success is not final, failure is not fatal: it is the courage to continue that counts. 🌟",
      "Don't watch the clock; do what it does. Keep going. ⏰",
      "The future belongs to those who believe in the beauty of their dreams. ✨",
      "Revision is the key to mastery. Keep reviewing! 📚",
      "Confidence comes from preparation. You've got this! 💼",
      "Every problem solved is a step closer to your dream job! 🎯"
    ];
    
    const randomQuote = motivationalQuotes[Math.floor(Math.random() * motivationalQuotes.length)];
    
    if (todayProgress.achieved && todayProgress.revisionAchieved) {
      return `🎉 Both goals achieved! ${randomQuote}`;
    } else if (todayProgress.achieved) {
      return `🎯 Daily goal achieved! ${randomQuote}`;
    } else if (streak.current > 0) {
      return `🔥 ${streak.current}-day streak! ${randomQuote}`;
    } else if (stats.interviewReadyProblems > 10) {
      return `💼 ${stats.interviewReadyProblems} problems interview-ready! ${randomQuote}`;
    } else {
      return `💪 Fresh start! ${randomQuote}`;
    }
  };

  const value: DSAContextType = {
    problems,
    userProblems,
    dailyProgress,
    userBadges,
    codeSnippets,
    revisionSessions,
    streak,
    loading,
    hasLoadedOnce,
    dailyGoal,
    revisionGoal,
    setRevisionGoal,
    loadAllData,
    loadProblems,
    loadUserProblems,
    loadDailyProgress,
    loadUserBadges,
    loadRevisionSessions,
    updateProblemStatus,
    createProblem,
    updateProblem,
    deleteProblem,
    markForRevision,
    toggleBookmark,
    updateConfidenceLevel,
    updateTodayProgress,
    updateDailyGoal,
    checkBadgeUnlocks,
    saveCodeSnippet,
    loadCodeSnippets,
    createRevisionSession,
    getTodayProgress,
    getStats,
    getRevisionInsights,
    getMotivationalMessage,
    resetData
  };

  return (
    <DSAContext.Provider value={value}>
      {children}
    </DSAContext.Provider>
  );
};