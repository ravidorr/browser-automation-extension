import type { Action, ElementEntry, ElementScore, Locator } from './types';
import { Storage } from './storage';

export class NavigationManager {
  private static readonly MIN_SCORE_THRESHOLD = 30;
  readonly isNavigationManager = true;

  /**
   * Score all elements based on user intent
   */
  static scoreElements(elements: ElementEntry[], intent: string): ElementScore[] {
    const scores: ElementScore[] = [];

    for (const element of elements) {
      const score = this.calculateElementScore(element);
      scores.push({
        elementId: element.id,
        score,
        reason: this.getScoreReason(score)
      });
      

    }

    // Sort by score descending
    const sortedScores = scores.sort((a, b) => b.score - a.score);
    
    // Log top scoring elements for debugging
    if (sortedScores.length > 0) {
      console.warn('Top scoring elements:', {
        intent,
        scores: sortedScores.slice(0, 5).map(score => ({
          elementId: score.elementId,
          score: score.score,
          reason: score.reason
        }))
      });
    }
    
    return sortedScores;
  }

  /**
   * Calculate score for a single element (0-100)
   */
  private static calculateElementScore(element: ElementEntry): number {
    let score = 0;

    // Base score for interactive elements
    if (element.role && ['button', 'link', 'menuitem'].includes(element.role)) {
      score += 10;
    }

    // Penalty for disabled/hidden elements
    if (element.disabled || element.hidden) {
      score = Math.max(0, score - 30);
    }

    // All semantic scoring is done by the LLM, not here
    // This is just a basic structural score
    return Math.min(100, Math.max(0, score));
  }

  /**
   * Get human-readable reason for score
   */
  private static getScoreReason(score: number): string {
    if (score === 0) return 'Element is not relevant to the task';
    if (score >= 80) return 'Element is highly relevant and likely leads to destination';
    if (score >= 50) return 'Element is relevant and may help with the task';
    return 'Element has some relevance but low confidence';
  }

  /**
   * Get the best action based on scored elements
   */
  static getBestAction(sessionId: string, elementScores: ElementScore[], elements: ElementEntry[]): Action | null {
    const navigationState = Storage.getNavigationState(sessionId);
    if (!navigationState) {
      throw new Error(`Navigation state not found for session ${sessionId}`);
    }

    // Find highest scoring element above threshold
    const bestScore = elementScores.find(score => score.score >= navigationState.minScoreThreshold);
    
    if (!bestScore) {
      return null; // No elements meet minimum threshold
    }

    // Find the corresponding element
    const element = elements.find(el => el.id === bestScore.elementId);
    if (!element) {
      return null;
    }

    // Create action based on element type
    return this.createActionFromElement(element, bestScore);
  }

  /**
   * Create action from element
   */
  private static createActionFromElement(element: ElementEntry, score: ElementScore): Action {
    const locator = this.createLocatorFromElement(element);
    
    return {
      op: 'CLICK',
      locator,
      notes: `Selected element with score ${String(score.score)}: ${score.reason}`,
      confidence: score.score / 100
    };
  }

  /**
   * Create locator from element
   */
  private static createLocatorFromElement(element: ElementEntry): Locator {
    // Try CSS classes first (most reliable for styled components)
    if (element.classes && element.classes.length > 0) {
      const [cssClass] = element.classes;
      if (!cssClass) {
        return this.createLocatorFromElement({ ...element, classes: null });
      }

      return {
        strategy: 'css',
        value: `.${cssClass}`,
        alternates: []
      };
    }

    // Try ID if available
    if (element.idAttr) {
      return {
        strategy: 'css',
        value: `#${element.idAttr}`,
        alternates: []
      };
    }

    // Try data-testid if available
    if (element.dataTestId) {
      return {
        strategy: 'dataTestId',
        value: element.dataTestId,
        alternates: []
      };
    }

    // Try aria-label if available
    if (element.ariaLabel) {
      return {
        strategy: 'aria',
        value: element.ariaLabel,
        alternates: []
      };
    }

    // Try role if available
    if (element.role) {
      return {
        strategy: 'role',
        value: element.role,
        alternates: []
      };
    }

    // Last resort: text-based locator (least reliable)
    if (element.text?.trim()) {
      return {
        strategy: 'text',
        value: element.text.trim(),
        alternates: []
      };
    }

    // Final fallback
    return {
      strategy: 'css',
      value: 'div',
      alternates: []
    };
  }

  /**
   * Check if we should backtrack
   */
  static shouldBacktrack(sessionId: string, elementScores: ElementScore[]): boolean {
    const navigationState = Storage.getNavigationState(sessionId);
    if (!navigationState?.backtrackingEnabled) {
      return false;
    }

    // Check if no elements meet minimum threshold
    const hasValidElements = elementScores.some(score => score.score >= navigationState.minScoreThreshold);
    
    return !hasValidElements && navigationState.navigationHistory.length > 0;
  }

  /**
   * Get backtrack action
   */
  static getBacktrackAction(sessionId: string): Action | null {
    const lastStep = Storage.getLastNavigationStep(sessionId);
    if (!lastStep) {
      return null;
    }

    // Find the next best element from the previous step
    const previousScores = lastStep.elementScores;
    const currentIndex = previousScores.findIndex(score => 
      score.elementId === lastStep.selectedAction.locator?.value
    );

    // Try the next best element
    for (let i = currentIndex + 1; i < previousScores.length; i++) {
      const score = previousScores[i];
      if (score && score.score >= this.MIN_SCORE_THRESHOLD) {
        return {
          op: 'CLICK',
          locator: {
            strategy: 'text', // Simplified for backtracking
            value: score.elementId,
            alternates: []
          },
          notes: `Backtracking: trying next best element with score ${String(score.score)}`,
          confidence: score.score / 100
        };
      }
    }

    return null; // No more options to try
  }
}
