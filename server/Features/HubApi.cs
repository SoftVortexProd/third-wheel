using static Core;

/// <summary>Messages list and My games data (Messages, Discover and My games pages). Owns its routes and tables; Program.cs only calls Migrate() and Map().</summary>
public static class HubApi
{
    /// <summary>Create tables / add columns. Runs on every start, so it must be idempotent.</summary>
    public static void Migrate()
    {
    }

    public static void Map(RouteGroupBuilder api)
    {
    }
}
