export declare function createFeedback(data: {
    interventionId: string;
    sessionId: string;
    feedback: string;
}): Promise<any>;
export declare function getFeedbackByIntervention(interventionId: string): Promise<any>;
export declare function getFeedbackStats(options?: {
    since?: Date;
}): Promise<any>;
//# sourceMappingURL=intervention-feedback.repo.d.ts.map