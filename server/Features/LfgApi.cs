using static Core;

/// <summary>Looking-for-group board. Owns its routes and tables; Program.cs only calls Migrate() and Map().</summary>
public static class LfgApi
{
    /// <summary>Create tables / add columns. Runs on every start, so it must be idempotent.</summary>
    public static void Migrate()
    {
    }

    public static void Map(RouteGroupBuilder api)
    {
    }
}
