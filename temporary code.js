 // UPDATES THE USER WHEN CHANGES ARE MADE
  useEffect(() => {
    console.log("useEffect triggered");
    const setupUser = async () => {
      let userId = "1";
      const userData = {
        id: userId,
        name: "You",
        Country: "NL",
        time_zone: "CET",
        bio: "This is my bio.",
        groupsEntered: ["Fitness Group", "Designers Hub"],
        status: "Active",
        pic: "https://example.com/profile.jpg",
        tasks,
        goals,
        streak_days: goals.reduce((sum, g) => sum + (g.streakNumber || 0), 0),
        days_active_per_week: Math.round(
          goals.reduce((sum, g) => sum + (g.weekStreak || 0), 0) / goals.length
        ),
      };

      setMlUser(userData);
      console.log("📡 Sending user data to server:", userData);

      try {
        // update user
        const updateRes = await fetch("http://192.168.1.32:5000/updateUser", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(userData),
        });
        const updateData = await updateRes.json();
        console.log("📤 Response from server (update):", updateData);

        // get all users
        const usersRes = await fetch("http://192.168.1.32:5000/users");
        const usersData = await usersRes.json();
        setAllUsers(usersData);

        // ✅ run algorithm after everything is ready
        
      } catch (err) {
        console.error("Update or fetch users error:", err);
      }
    };

    setupUser();
  }, [tasks, goals]);

  // RERUNS THE ALGORITHM AFTER ML USER IS UPDATED
  useEffect(() => {
    if (mlUser) handleRunAlgorithm();
  }, [mlUser]);



  // FETCH GROUPS
  useEffect(() => {
    const fetchGroups = async () => {
      const res = await fetch("http://192.168.1.32:5000/groups");
      const data = await res.json();
      setAllGroupsDB(data); // only once
    };
    fetchGroups();
  }, []); // empty dependency array

  // After fetching users and running algorithm
  useEffect(() => {
    if (!algorithmResult || !mlUser || !allGroupsDB.length) return;

    const groupsFromAlg = algorithmResult.combined_best_to_worst?.[mlUser.id]
      ?.filter(item => item.type === "group") || [];

    const mappedGroups = groupsFromAlg.map(item => {
      const groupData = allGroupsDB.find(g => g.id === item.id);
      return {
        id: item.id,
        name: groupData?.name || item.id,
        bio: groupData?.bio || "",
        type: "group",
        page: item.id,
        similarity: item.score,
      };
    });

    setAllGroups(mappedGroups);
  }, [algorithmResult, mlUser, allGroupsDB]); // ✅ stable deps

  useEffect(() => {
    if (!allUsers || !allGroupsDB) return;

    const mappedUsers = allUsers.map(u => ({
      id: u.id,
      name: u.name,
      bio: u.bio || "",
      type: "person",
      page: u.id,
      status: "suggested",
    }));

    const mappedGroups = allGroupsDB.map(g => ({
      id: g.id,
      name: g.name,
      bio: g.bio || "",
      type: "group",
      page: g.id,
      status: "suggested",
    }));

    // ✅ merge with existing items but avoid duplicates
    setItems(prev => {
      const combined = [...prev, ...mappedUsers, ...mappedGroups];
      const unique = combined.filter(
        (v, i, a) => a.findIndex(t => t.page === v.page) === i
      );
      return unique;
    });
  }, [allUsers, allGroupsDB]);





  // THE FUNCTION THAT MAKE THE ALGROTIHM RUN
  const handleRunAlgorithm = async () => {
    console.log("youre algrotihm is beign ran"); // ← add here
    try {
      const question = "Which user should be matched?"; // example question
      const res = await fetch("http://192.168.1.32:5000/algorithm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });

      const data = await res.json();
      console.log("📊 Combined Algorithm Result:", data);

      // Store full result
      setAlgorithmResult(data);

      // Use your current user's ID dynamically
      const myId = mlUser.id; // e.g. "1"

      // Get combined ranking (users + groups)
      const myRankings = data.combined_best_to_worst?.[myId] || [];
      const myGroupRankings = myRankings.filter(item => item.type === "group");
      setMyRanking(myGroupRankings);

    } catch (err) {
      console.error("❌ Algorithm call error:", err);
    }
  };

  {currentPage === 'addpeople' && ( <View style={{ minHeight: Dimensions.get('window').height, flexGrow: 1, padding: 20 }}> {/* Back bar */} <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}> <TouchableOpacity onPress={() => setCurrentPage('people')}> <Ionicons name="arrow-back" size={24} color="black" /> </TouchableOpacity> <Text style={{ fontSize: 20, fontWeight: 'bold', marginLeft: 10 }}>Add People</Text> </View> {/* Search bar */} <View style={{ flexDirection: 'row', alignItems: 'center', borderColor: '#ccc', borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, height: 40, marginBottom: 15, }} > <TextInput placeholder="Search..." value={search} onChangeText={setSearch} style={{ flex: 1, borderWidth: 0, outlineStyle: 'none', }} /> <Ionicons name="search" size={20} color="grey" /> </View> {/* Suggested or searched list */} <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled> {(search.trim().length > 0 ? items.filter( i => i.status === 'suggested' && i.name.toLowerCase().includes(search.toLowerCase()) && i.page !== mlUser?.id ) : [...myRanking, ...items.filter(i => !myRanking.some(r => r.page === i.page))] ).map(i => ( <ExpandableGroup key={i.page} item={i} onAddUser={handleAddUser} expanded={expandedTitle === i.page} onToggle={() => onToggle(i.page)} setCurrentPage={setCurrentPage} /> ))} </ScrollView> </View> )}