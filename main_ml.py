# main_ml.py
import numpy as np
from sklearn.preprocessing import MinMaxScaler
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.feature_extraction.text import TfidfVectorizer
import pickle
import json
import os
import sys
sys.stderr.reconfigure(encoding='utf-8')

from MLData.cata import category_keywords, category_expected_times, category_skill_weights

def run(users):
    # --- Flatten category keywords ---
    flat_category_keywords = {
        cat: [kw for sublist in subcats.values() for kw in sublist]
        for cat, subcats in category_keywords.items()
    }

    # --- Normalize tasks/goals ---
    def normalize_item(item, is_goal=False):
        if is_goal:
            return {
                "title": item["title"],
                "time_taken": item.get("timeTaken", 0),
                "completed": item.get("workoutCompleted", False),
            }
        else:
            return {
                "title": item["text"],
                "time_taken": item.get("timeTaken", 0),
                "completed": item.get("checked", False),
            }

    for user in users:
        user["norm_tasks"] = [normalize_item(t) for t in user.get("tasks", [])]
        user["norm_goals"] = [normalize_item(g, is_goal=True) for g in user.get("goals", [])]


    # --- Category vectorization ---
    category_docs = {cat: " ".join(keywords) for cat, keywords in flat_category_keywords.items()}
    vectorizer = TfidfVectorizer()
    category_names = list(category_docs.keys())
    category_vectors = vectorizer.fit_transform(category_docs.values())

    def auto_assign_category(title):
        title_vec = vectorizer.transform([title])
        similarities = cosine_similarity(title_vec, category_vectors)[0]
        return category_names[similarities.argmax()]

    for user in users:
        for t in user["norm_tasks"] + user["norm_goals"]:
            t["category"] = auto_assign_category(t["title"])

    # --- Expected time history ---
    try:
        with open("expected_times_history.pkl", "rb") as f:
            expected_times_history = pickle.load(f)
    except:
        expected_times_history = {}

    def expected_time_for_item(item, weight_history=0.7):
        cat = item.get("category", "other")
        diff = round(min(max(item.get("difficulty", 3), 1), 5))
        manual_time = category_expected_times.get(cat, category_expected_times.get("other", {})).get(diff, 30)
        history_time = expected_times_history.get((cat, diff), manual_time)
        return weight_history * history_time + (1 - weight_history) * manual_time

    # --- Predict difficulty ---
    def predict_difficulty(item, user):
        time = item.get("time_taken", 0)
        expected = expected_time_for_item(item, weight_history=0.0)
        base_diff = time / max(expected, 1)
        completion_factor = user.get("completion_factor", 1)
        base_diff *= 1 / max(completion_factor, 0.1)

        adjustment = 1.0
        adjustment *= 1 - min(user.get("streak_days", 0) / 30, 0.3)
        adjustment *= 1 - min(user.get("success_rate", 0), 0.3)

        difficulty = base_diff * adjustment
        return min(max(difficulty, 1), 5)

    # --- Skill score ---
    def skill_score(item):
        time = item.get("time_taken", 1)
        difficulty = item.get("difficulty", 1)
        return difficulty / max(time, 1)

    # --- Compute user stats ---
    for user in users:
        items = user["norm_tasks"] + user["norm_goals"]
        user["success_rate"] = sum(i["completed"] for i in items) / len(items) if items else 0
        user["completion_factor"] = 1.0

    # --- First pass difficulty ---
    for user in users:
        for t in user["norm_tasks"]:
            t["difficulty"] = predict_difficulty(t, user)
        for g in user["norm_goals"]:
            g["difficulty"] = predict_difficulty(g, user)

    # --- Build expected_times_history ---
    history = []
    for user in users:
        for t in user["norm_tasks"] + user["norm_goals"]:
            history.append({
                "category": t["category"],
                "difficulty": round(t["difficulty"]),
                "time_taken": t.get("time_taken", 0),
            })

    default_time = 30
    categories_set = set(h["category"] for h in history)
    for cat in categories_set:
        for diff in range(1, 6):
            times = [h["time_taken"] for h in history if h["category"] == cat and h["difficulty"] == diff]
            expected_times_history[(cat, diff)] = np.mean(times) if times else category_expected_times.get(cat, {}).get(diff, default_time)

    with open("expected_times_history.pkl", "wb") as f:
        pickle.dump(expected_times_history, f)

    # --- Second pass difficulty ---
    for user in users:
        for t in user["norm_tasks"]:
            t["difficulty"] = predict_difficulty(t, user)
        for g in user["norm_goals"]:
            g["difficulty"] = predict_difficulty(g, user)

    # --- Build interest vectors ---
    category_docs = [" ".join([i["category"] for i in u["norm_tasks"] + u["norm_goals"]]) for u in users]
    vectorizer = TfidfVectorizer()
    interest_matrix = vectorizer.fit_transform(category_docs).toarray()
    all_categories = vectorizer.get_feature_names_out()

    def build_interest_vector(user_idx):
        return interest_matrix[user_idx]

    # --- Compute features ---
    for idx, user in enumerate(users):
        items = user["norm_tasks"] + user["norm_goals"]
        expected_times = [expected_time_for_item(i) for i in items]
        actual_times = [i.get("time_taken", 0) for i in items]

        user["completion_factor"] = np.mean([e / max(a, 1) for e, a in zip(expected_times, actual_times)]) if items else 1
        user["avg_skill"] = np.mean([skill_score(i) for i in items]) if items else 0
        user["avg_task_time"] = np.mean(actual_times) if items else 0

        categories = [i["category"] for i in items]
        user["category_distribution"] = {c: categories.count(c)/len(categories) for c in set(categories)} if categories else {}
        user["openness"] = len(set(categories)) / len(all_categories) if categories else 0
        user["interest_vector"] = build_interest_vector(idx)
        user["consistency"] = user.get("streak_days", 0) / 7
        user["pace"] = len(items) / max(sum(actual_times), 1)

        user["feature_vector"] = np.concatenate((
            [
                user["avg_skill"],
                user["success_rate"],
                user["completion_factor"],
                user["avg_task_time"],
                user["consistency"],
                user["pace"],
                user["openness"]
            ],
            user["interest_vector"]
        ))

    # --- Dynamic skill weighting ---
    for cat in flat_category_keywords.keys():
        cat_skills = [i["difficulty"] / max(i.get("time_taken", 1), 1)
                      for u in users for i in u["norm_tasks"] + u["norm_goals"] if i["category"] == cat]
        category_skill_weights[cat] = np.mean(cat_skills) if cat_skills else 1.0

    # --- Weights ---
    weights = {
        "skill": 0.20,
        "success_rate": 0.10,
        "completion_factor": 0.15,
        "avg_task_time": 0.05,
        "consistency": 0.15,
        "pace": 0.10,
        "openness": 0.05,
        "interests": 0.20,
    }

    def apply_weights(user_vector, n_interest_features, main_cat="other"):
        w = np.array(
            [
                weights["skill"] * category_skill_weights.get(main_cat, 1.0),
                weights["success_rate"],
                weights["completion_factor"],
                weights["avg_task_time"],
                weights["consistency"],
                weights["pace"],
                weights["openness"]
            ] + [weights["interests"]] * n_interest_features
        )
        return user_vector * w

    # --- Location similarity ---
    def build_location_matrix(users):
        n = len(users)
        matrix = np.zeros((n, n))
        countries = [u.get("Country") for u in users]
        timezones = [u.get("time_zone") for u in users]
        for i in range(n):
            for j in range(n):
                if i == j:
                    matrix[i,j] = 1
                elif timezones[i] == timezones[j]:
                    matrix[i,j] = 1.0 if countries[i] == countries[j] else 0.8
                else:
                    matrix[i,j] = 0.3
        return matrix

    location_matrix = build_location_matrix(users)

    # --- MinMax scaling + weighting ---
    weighted_vectors = np.array([
        apply_weights(
            u["feature_vector"],
            len(all_categories),
            main_cat=max([t["category"] for t in u["norm_tasks"] + u["norm_goals"]],
                         key=[t["category"] for t in u["norm_tasks"] + u["norm_goals"]].count)
            if u["norm_tasks"] + u["norm_goals"] else "other"
        ) for u in users
    ])
    scaler = MinMaxScaler()
    weighted_vectors_scaled = scaler.fit_transform(weighted_vectors)

    similarity_matrix = cosine_similarity(weighted_vectors_scaled)
    combined_similarity = (0.8 * similarity_matrix) + (0.2 * location_matrix)

    user_ids = [u["id"] for u in users]
    best_pair, best_value = (None, None), -1
    worst_pair, worst_value = (None, None), 2
    col_w = 10

    # --- Debug prints to stderr ---
    print("\n=== Auto-Assigned Categories & Predicted Difficulties ===", file=sys.stderr)
    for user in users:
        for t in user["norm_tasks"] + user["norm_goals"]:
            print(f"User {user['id']} -> {t['title']} -> Category: {t['category']} -> Difficulty: {t['difficulty']:.2f} -> Expected time: {expected_time_for_item(t):.1f} min", file=sys.stderr)
        print(f"Category distribution: {user['category_distribution']}", file=sys.stderr)
        print(f"Openness: {user['openness']:.2f}\n", file=sys.stderr)

    print("\n=== Combined Similarity Matrix (Skill + Location) ===", file=sys.stderr)
    print("".ljust(col_w), end="", file=sys.stderr)
    for uid in user_ids:
        print(f"{uid:>{col_w}}", end="", file=sys.stderr)
    print(file=sys.stderr)
    for i, uid in enumerate(user_ids):
        print(f"{uid:>{col_w}}", end="", file=sys.stderr)
        for j in range(len(user_ids)):
            if j <= i:
                print("".ljust(col_w), end="", file=sys.stderr)
            else:
                val = combined_similarity[i,j]
                print(f"{val:{col_w}.3f}", end="", file=sys.stderr)
                if val > best_value:
                    best_value, best_pair = val, (user_ids[i], user_ids[j])
                if val < worst_value:
                    worst_value, worst_pair = val, (user_ids[i], user_ids[j])
        print(file=sys.stderr)

    print(f"\nBest connection: {best_pair} -> similarity {best_value:.3f}", file=sys.stderr)
    print(f"Worst connection: {worst_pair} -> similarity {worst_value:.3f}", file=sys.stderr)


    # --- Maak best-to-worst lijst per user ---
    best_to_worst = {}
    for i, user_id in enumerate(user_ids):
        scores = []
        for j, other_id in enumerate(user_ids):
            if i == j:
                continue  # skip jezelf
            scores.append({"mac": other_id, "score": combined_similarity[i, j]})
        # Sorteer van hoog naar laag
        best_to_worst[user_id] = sorted(scores, key=lambda x: x["score"], reverse=True)

    print("\n--- Best to Worst per User ---", file=sys.stderr)
    for uid, suggestions in best_to_worst.items():
        print(f"{uid}:", file=sys.stderr)
        for s in suggestions[:5]:  # laat de top 5 zien
            print(f"  → {s['mac']} ({s['score']:.3f})", file=sys.stderr)
            
    # Voeg toe aan je results
    results = {
        "user_ids": [u["id"] for u in users],
        "feature_vectors": [u["feature_vector"].tolist() for u in users],
        "similarity_matrix": combined_similarity.tolist(),
        "categories": {u["id"]: [t["category"] for t in u["norm_tasks"] + u["norm_goals"]] for u in users},
        "best_connection": {"pair": best_pair, "similarity": best_value},
        "worst_connection": {"pair": worst_pair, "similarity": worst_value},
        "best_to_worst": best_to_worst   # ✅ hier toevoegen
    }

    
    return results

if __name__ == "__main__":
    import sys, json

    try:
        users = json.load(sys.stdin)  # Node sends users here
    except Exception:
        print(json.dumps({"best_to_worst": {}}), flush=True)
        sys.exit(0)

    if not users:
        print(json.dumps({"best_to_worst": {}}), flush=True)
        sys.exit(0)

    # Call your ML algorithm
    results = run(users)

    # Only print JSON here
    print("Starting algorithm...", file=sys.stderr)  # debug only
    print(json.dumps(results), flush=True)          # JSON only to stdout

