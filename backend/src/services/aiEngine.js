/**
 * AI Engine (Security AI)
 * Reactive state machine that responds to player actions
 */

class AIEngine {
  /**
   * Trigger AI response
   */
  async trigger(session, eventType, data) {
    const state = session.aiState;
    
    switch (eventType) {
      case 'suspicious_command':
        state.level = Math.min(state.level + 2, 10);
        if (state.status === 'idle') {
          state.status = 'probing';
        }
        // Trace percentage based on AI level (0-10 maps to roughly 0-100%)
        // Add some randomness but make it scale with level
        const baseTrace = state.level * 10;
        const randomVariation = Math.floor(Math.random() * 20) - 10; // -10 to +10
        const tracePercent = Math.max(0, Math.min(100, baseTrace + randomVariation));
        
        // Special behavior at maximum level (100% trace)
        if (state.level >= 10) {
          state.status = 'alarm';
          return {
            ...this.sendMessage(session, `[SECURITY] CRITICAL: Trace complete. Identity compromised.\n[SECURITY] Initiating emergency lockdown protocol...\n[SECURITY] Terminal access will be terminated.`),
            shouldLogout: true
          };
        }
        
        // Escalate to alarm at level 5+
        if (state.level >= 5 && state.status === 'probing') {
          state.status = 'alarm';
        }
        
        return this.sendMessage(session, `[SECURITY] Unauthorized access attempt detected. Trace: ${tracePercent}%`);
      
      case 'failed_puzzle':
        state.level = Math.min(state.level + 1, 10);
        if (state.level >= 5 && state.status === 'probing') {
          state.status = 'alarm';
        }
        return this.sendMessage(session, `[SECURITY] Failed authentication detected. Security level increased.`);
      
      case 'admin_escalate':
        state.level = Math.min(state.level + 3, 10);
        state.status = 'alarm';
        return this.sendMessage(session, `[SECURITY] CRITICAL ALERT: System integrity compromised. Initiating countermeasures...`);
    }
    
    return null;
  }

  /**
   * Send AI message (returns message to be sent via socket)
   */
  sendMessage(session, message) {
    return {
      type: 'ai_message',
      message,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get AI state
   */
  getState(session) {
    return session.aiState;
  }

  /**
   * Set AI state (admin action)
   */
  setState(session, level, status) {
    session.aiState.level = Math.max(0, Math.min(level, 10));
    session.aiState.status = status || 'idle';
  }

  /**
   * Issue challenge (riddle/puzzle)
   */
  issueChallenge(session) {
    const challenges = [
      {
        question: "What is the answer to life, the universe, and everything?",
        answer: "42"
      },
      {
        question: "What comes after 2, 3, 5, 7, 11?",
        answer: "13"
      }
    ];
    
    const challenge = challenges[Math.floor(Math.random() * challenges.length)];
    session.aiState.challenge = challenge;
    
    return this.sendMessage(session, `[SECURITY CHALLENGE] ${challenge.question}\nType your answer to continue.`);
  }

  /**
   * Validate challenge answer
   */
  validateChallenge(session, answer) {
    const challenge = session.aiState.challenge;
    if (!challenge) return false;
    
    const correct = answer.trim().toLowerCase() === challenge.answer.toLowerCase();
    
    if (correct) {
      session.aiState.level = Math.max(0, session.aiState.level - 2);
      if (session.aiState.level <= 2) {
        session.aiState.status = 'idle';
      }
      session.aiState.challenge = null;
      return { success: true, message: '[SECURITY] Challenge passed. Security level decreased.' };
    } else {
      session.aiState.level = Math.min(session.aiState.level + 1, 10);
      return { success: false, message: '[SECURITY] Incorrect answer. Security level increased.' };
    }
  }
}

export default new AIEngine();
