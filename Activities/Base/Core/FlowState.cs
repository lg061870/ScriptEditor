namespace ConversaCore.TopicFlow {
    /// <summary>
    /// Flow-specific states (lighter than ConversationState).
    /// </summary>
    public enum FlowState {
        Idle,
        Running,
        WaitingForInput,
        Completed,
        Failed
    }
}
