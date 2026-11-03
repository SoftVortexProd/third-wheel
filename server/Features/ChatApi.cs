using static Core;

/// <summary>replies, reactions, edit/delete, attachments, GIFs, typing, RCKT subscription. Owns its routes and tables; Program.cs only calls Migrate() and Map().</summary>
public static class ChatApi
{
    /// <summary>Create tables / add columns. Runs on every start, so it must be idempotent (CREATE IF NOT EXISTS, check PRAGMA table_info before ALTER).</summary>
    public static void Migrate()
    {
    }

    public static void Map(RouteGroupBuilder api)
    {
    }
}
