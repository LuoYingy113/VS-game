import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class scorer {

    /**
     * 队伍匹配结果封装类，用于排序
     */
    public static class MatchResult implements Comparable<MatchResult> {
        private String teamId;
        private double score;
        private double distance;
        private boolean isBlacklisted;
        private boolean hasLiked;
        private int ageDiff;

        public MatchResult(String teamId, double score, double distance, boolean isBlacklisted, boolean hasLiked, int ageDiff) {
            this.teamId = teamId;
            this.score = score;
            this.distance = distance;
            this.isBlacklisted = isBlacklisted;
            this.hasLiked = hasLiked;
            this.ageDiff = ageDiff;
        }

        public double getScore() {
            return score;
        }

        // 按照评分从高到低排序 (降序)
        @Override
        public int compareTo(MatchResult other) {
            return Double.compare(other.score, this.score);
        }

        public void printResult() {
            System.out.println("----------------------------------------");
            System.out.println("目标队伍 ID: " + teamId);
            System.out.printf("距离: %.2f 千米%n", distance);
            System.out.println("是否被拉黑: " + isBlacklisted);
            System.out.println("是否已点赞: " + hasLiked);
            System.out.println("年龄差: " + ageDiff);
            System.out.println("计算出的匹配总分: " + score);
        }
    }

    /**
     * 计算两支队伍的匹配评分
     */
    public static double calculateMatchScore(double lat1, double lon1, double lat2, double lon2, 
                                             boolean isBlacklisted, boolean hasLiked, int ageDiff) {
        
        // 1. 黑名单判定：如果在黑名单中，直接返回 -1 分
        if (isBlacklisted) {
            return -1.0;
        }

        // 2. 计算球面距离（单位：千米）
        double distance = calculateHaversineDistance(lat1, lon1, lat2, lon2);

        double distanceScore;
        double ageScore;

        if (hasLiked) {
            // 【点赞队伍】：无视距离和年龄差过大的限制，超出的部分进行截断处理（确保分数不低于0）
            double clampedDistance = Math.min(distance, 30.0);
            distanceScore = (1.0 - (clampedDistance / 30.0)) * 100.0;
            
            // 年龄差过大时，年龄分取 0，不直接返回 0 分
            ageScore = Math.max(0.0, (30.0 - (ageDiff * 10.0)) / 30.0 * 100.0);
        } else {
            // 【普通队伍】：严格执行 2 岁年龄差和 30km 距离限制
            if (ageDiff > 1 || distance > 30.0) {
                return 0.0;
            }
            distanceScore = (1.0 - (distance / 30.0)) * 100.0;
            ageScore = Math.max(0.0, (30.0 - (ageDiff * 10.0)) / 30.0 * 100.0);
        }

        // 3. 计算基础得分（距离与年龄权重各占 0.5，范围 0 ~ 100 分）
        double baseScore = (distanceScore * 0.5) + (ageScore * 0.5);

        // 4. 如果点赞了，基础分加 100，使其落在 100 ~ 200 分之间，并可在点赞队伍内通过距离/年龄排序
        if (hasLiked) {
            return baseScore + 100.0;
        }

        return baseScore;
    }

    /**
     * 使用 Haversine 公式计算地球表面两点之间的球面距离
     */
    private static double calculateHaversineDistance(double lat1, double lon1, double lat2, double lon2) {
        final double EARTH_RADIUS_KM = 6371.0;

        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);

        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                   Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) *
                   Math.sin(dLon / 2) * Math.sin(dLon / 2);

        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return EARTH_RADIUS_KM * c;
    }
   
    private static double calculatePlanarDistance(double lat1, double lon1, double lat2, double lon2) {
        double dLat = lat2 - lat1;
        double dLon = lon2 - lon1;

        // 使用勾股定理计算平面直线距离
        return Math.sqrt(dLat * dLat + dLon * dLon)*111.0;
    }
    /**
     * 从数据库查询指定用户与所有队伍的匹配评分，并按分数从高到低排序输出
     */
    public static void evaluateAllMatchesFromDB(String userId) {
        String url = System.getenv("DB_URL");
        String user = System.getenv("DB_USER");
        String password = System.getenv("DB_PASSWORD");

        try {
            Class.forName("org.postgresql.Driver");
        } catch (ClassNotFoundException e) {
            System.err.println("错误：找不到 PostgreSQL 驱动类！");
            e.printStackTrace();
            return;
        }

        String sql = """
            SELECT
                u.latitude  AS user_lat,
                u.longitude AS user_lon,
                (SELECT ROUND(AVG(t.team_age))::int FROM public.team_groups t WHERE t.coach_id = u.id) AS user_team_age,
                c.latitude  AS target_lat,
                c.longitude AS target_lon,
                tg.id       AS target_team_id,
                tg.team_age AS target_team_age,
                EXISTS (SELECT 1 FROM public.user_blacklist ub WHERE ub.user_id = u.id AND ub.team_id = tg.id) AS is_blacklisted,
                EXISTS (SELECT 1 FROM public.user_likes ul WHERE ul.user_id = u.id AND ul.team_id = tg.id) AS has_liked
            FROM public.users u
            CROSS JOIN public.team_groups tg
            JOIN public.users c ON c.id = tg.coach_id
            WHERE u.id = ?
            """;

        List<MatchResult> results = new ArrayList<>();

        try (Connection connection = DriverManager.getConnection(url, user, password);
             PreparedStatement statement = connection.prepareStatement(sql)) {

            statement.setString(1, userId);

            try (ResultSet result = statement.executeQuery()) {
                while (result.next()) {
                    double userLat = result.getDouble("user_lat");
                    double userLon = result.getDouble("user_lon");
                    double targetLat = result.getDouble("target_lat");
                    double targetLon = result.getDouble("target_lon");
                    String targetTeamId = result.getString("target_team_id");
                    
                    int userTeamAge = result.getInt("user_team_age");
                    int targetTeamAge = result.getInt("target_team_age");
                    boolean isBlacklisted = result.getBoolean("is_blacklisted");
                    boolean hasLiked = result.getBoolean("has_liked");

                    int ageDiff = Math.abs(userTeamAge - targetTeamAge);
                    double distance = calculateHaversineDistance(userLat, userLon, targetLat, targetLon);

                    // 计算匹配评分
                    double score = calculateMatchScore(userLat, userLon, targetLat, targetLon,
                                                       isBlacklisted, hasLiked, ageDiff);

                    results.add(new MatchResult(targetTeamId, score, distance, isBlacklisted, hasLiked, ageDiff));
                }
            }
        } catch (SQLException e) {
            e.printStackTrace();
            return;
        }

        if (results.isEmpty()) {
            System.out.println("没有找到对应的用户或系统中没有任何队伍数据。");
            return;
        }

        // 按照评分从高到低排序
        Collections.sort(results);

        // 输出所有结果
        System.out.println("=== 用户 " + userId + " 与所有队伍的匹配评估结果（按评分从高到低排序） ===");
        for (MatchResult res : results) {
            res.printResult();
        }
    }

    /**
     * 批量模式：从标准输入逐行读取
     * "lat1 lon1 lat2 lon2 isBlacklisted hasLiked ageDiff"，每行输出 "评分 距离(千米)"。
     */
    public static void runBatch() throws IOException {
        BufferedReader reader = new BufferedReader(new InputStreamReader(System.in));
        String line;
        while ((line = reader.readLine()) != null) {
            line = line.trim();
            if (line.isEmpty()) {
                continue;
            }
            String[] p = line.split("\\s+");
            double score = calculateMatchScore(
                    Double.parseDouble(p[0]), Double.parseDouble(p[1]),
                    Double.parseDouble(p[2]), Double.parseDouble(p[3]),
                    Boolean.parseBoolean(p[4]), Boolean.parseBoolean(p[5]),
                    Integer.parseInt(p[6]));
            double distance = calculateHaversineDistance(
                    Double.parseDouble(p[0]), Double.parseDouble(p[1]),
                    Double.parseDouble(p[2]), Double.parseDouble(p[3]));
            System.out.println(score + " " + distance);
        }
    }

    public static void main(String[] args) throws IOException {
        if (args.length > 0 && args[0].equals("--batch")) {
            runBatch();
        } else if (args.length > 0) {
            evaluateAllMatchesFromDB(args[0]);
        } else {
            System.out.println("用法：Main <userId>，例如：test_coach_01");
        }
    }
}