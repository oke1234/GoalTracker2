import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.preprocessing import MinMaxScaler
import json
import sys
import pickle
sys.stderr.reconfigure(encoding='utf-8')

from main_ml import run as run_users  # reuse user processing

def run_groups(data):
    users = data["users"]
    groups = data["groups"]  # [{ "id": "group1", "members": ["u1", "u2", ...] }]

    # 1️⃣ Run user ML to get feature vectors
    user_results = run_users(users)
    # After running run_users
    user_ids = user_results["user_ids"]
    user_vectors_list = [np.array(vec) for vec in user_results["feature_vectors"]]

    # Build group vectors
    group_vectors = {}
    for g in groups:
        member_vecs = [vec for uid, vec in zip(user_ids, user_vectors_list) if uid in g["members"]]
        if member_vecs:
            group_vectors[g["id"]] = np.mean(member_vecs, axis=0)
        else:
            group_vectors[g["id"]] = np.zeros_like(user_vectors_list[0])

    # Scale
    scaled_users = MinMaxScaler().fit_transform(np.array(user_vectors_list))
    scaled_groups = MinMaxScaler().fit_transform(np.array(list(group_vectors.values())))

    # Compute similarity
    sim_matrix = cosine_similarity(scaled_users, scaled_groups)

    # Safe indexing
    group_ids = list(group_vectors.keys())
    best_to_worst_groups = {}
    for i, uid in enumerate(user_ids):
        if i >= sim_matrix.shape[0]:  # safety check
            continue
        scores = [{"group": gid, "score": sim_matrix[i, j]} for j, gid in enumerate(group_ids)]
        best_to_worst_groups[uid] = sorted(scores, key=lambda x: x["score"], reverse=True)

    # Debug output (stderr) — cleaner formatting
    print("\n=== Best to Worst Groups per User ===", file=sys.stderr)
    for uid, suggestions in best_to_worst_groups.items():
        print(f"\nUser {uid}:", file=sys.stderr)
        for rank, s in enumerate(suggestions, start=1):
            print(f"  {rank:>2}. {s['group']:<20} → score: {s['score']:.3f}", file=sys.stderr)


    results = {
        "best_to_worst_groups": best_to_worst_groups,
        "similarity_matrix": sim_matrix.tolist(),
        "group_ids": list(group_vectors.keys())
    }

    return results


if __name__ == "__main__":
    try:
        data = json.load(sys.stdin)
    except:
        print(json.dumps({"best_to_worst_groups": {}}), flush=True)
        sys.exit(0)

    if not data.get("users") or not data.get("groups"):
        print(json.dumps({"best_to_worst_groups": {}}), flush=True)
        sys.exit(0)

    results = run_groups(data)
    print("Starting algorithm...", file=sys.stderr)  # debug only
    print(json.dumps(results), flush=True)          # JSON only to stdout

