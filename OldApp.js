import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  TextInput,
  ScrollView,
  Modal,
  Animated,
  FlatList,
  Pressable,
  Keyboard,
  Dimensions,
  Button
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { io } from "socket.io-client";
import { v4 as uuidv4 } from "uuid";

import * as Google from 'expo-auth-session/providers/google';
import { auth } from './firebase';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import * as AuthSession from 'expo-auth-session';


const screenHeight = Dimensions.get('window').height;

function GroupPeople({ setCurrentPage, archived = false, items, setItems }) {
  const [openMenuFor, setOpenMenuFor] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ x: 0, y: 0 });
  const ellipsisRefs = useRef({});
  const [itemToDelete, setItemToDelete] = useState(null);

  // Filters
  const currentGroups = items.filter(
    (i) => i.type === 'group' && i.status === (archived ? 'archived' : 'active')
  );
  const currentPeople = items.filter(
    (i) =>
      i.type === 'person' && i.status === (archived ? 'archived' : 'active')
  );

  const moveItem = (pageName, newStatus) => {
    setItems((prev) =>
      prev.map((item) =>
        item.page === pageName ? { ...item, status: newStatus } : item
      )
    );
  };

  const deleteItem = (pageName) => {
    let deleted = null;
    setItems((prev) => {
      const updated = prev.filter((item) => {
        if (item.page === pageName) {
          deleted = { ...item, status: 'suggestion' };
          return false;
        }
        return true;
      });
      return deleted ? [deleted, ...updated] : updated;
    });
    closeMenu();
  };

  const openMenu = (page) => {
    ellipsisRefs.current[page]?.measureInWindow((x, y, width, height) => {
      setDropdownPosition({ x, y: y + height });
      setOpenMenuFor(page);
    });
  };

  const closeMenu = () => setOpenMenuFor(null);

  return (
    <>
      {currentGroups.map((group) => (
        <TouchableOpacity
          key={group.page}
          onPress={() => {
            setCurrentPage(group.page);
            closeMenu();
          }}>
          <View style={styles.textbox1}>
            <Ionicons name="people" size={24} color="grey" />
            <Text style={styles.box1text}>{group.name}</Text>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <TouchableOpacity
                ref={(ref) => (ellipsisRefs.current[group.page] = ref)}
                onPress={() => openMenu(group.page)}>
                <Ionicons name="ellipsis-horizontal" size={20} color="grey" />
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      ))}

      {(currentGroups.length > 0 && currentPeople.length > 0) && (
        <View style={styles.dashedLine} />
      )}

      {currentGroups.length === 0 && currentPeople.length === 0 && (
        <Text style={{ 
          color: 'lightgray', 
          textAlign: 'center', 
          marginTop: 20, 
          fontSize: 16 
        }}>
          {archived ? 'No archived contacts' : 'No active contacts'}
        </Text>
      )}

      {currentPeople.map((person) => (
        <TouchableOpacity
          key={person.page}
          onPress={() => {
            setCurrentPage(person.page);
            closeMenu();
          }}>
          <View style={styles.textbox1}>
            <Ionicons
              name={person.icon || 'person-circle'}
              size={24}
              color="grey"
            />
            <Text style={styles.box1text}>{person.name}</Text>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <TouchableOpacity
                ref={(ref) => (ellipsisRefs.current[person.page] = ref)}
                onPress={() => openMenu(person.page)}>
                <Ionicons name="ellipsis-horizontal" size={20} color="grey" />
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      ))}

      {confirmDelete && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={{ marginBottom: 15 }}>Are you sure?</Text>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-around',
                width: '100%',
              }}>
              <TouchableOpacity
                onPress={() => setConfirmDelete(false)}
                style={styles.modalButton}>
                <Text>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  deleteItem(itemToDelete);
                  setConfirmDelete(false);
                  setItemToDelete(null);
                }}
                style={[styles.modalButton, { backgroundColor: 'red' }]}>
                <Text style={{ color: 'white' }}>Yes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      <Modal transparent visible={!!openMenuFor} onRequestClose={closeMenu}>
        <TouchableOpacity
          style={{ flex: 1 }}
          activeOpacity={1}
          onPress={closeMenu}>
          <View
            style={[
              styles.dropdown,
              {
                position: 'absolute',
                top: dropdownPosition.y,
                left: dropdownPosition.x - 70,
                maxWidth: 110,
                elevation: 10,
                zIndex: 100,
              },
            ]}>
            <TouchableOpacity
              style={styles.item}
              onPress={() => {
                setItemToDelete(openMenuFor);
                closeMenu();
                setConfirmDelete(true);
              }}>
              <Text style={styles.text}>Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.item}
              onPress={() => {
                moveItem(openMenuFor, archived ? 'active' : 'archived');
                closeMenu();
              }}>
              <Text style={styles.text}>
                {archived ? 'Unarchive' : 'Archive'}
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

export const PageWithBack = ({ currentPage, pageName, setCurrentPage, title, bio, type, archived, mlUser }) => {
  const [profileChatPage, setProfileChatPage] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const scrollViewRef = useRef();
  const socketRef = useRef();

  useEffect(() => {
    // Connect to Socket.IO server
    socketRef.current = io("http://192.168.1.2:5000"); // your server IP
    const socket = socketRef.current;

    // Join this chat room
    socket.emit("joinRoom", pageName);

    // Listen for live messages
    socket.on("newMessage", (msg) => {
      console.log("Received:", msg); // debug
      setMessages((prev) => [...prev, msg]);
    });

    // Fetch initial chat history
    fetch(`http://192.168.1.2:5000/chats/${pageName}/messages`)
      .then((res) => res.json())
      .then((data) => setMessages(data))
      .catch((err) => console.error("Fetch error:", err));

    return () => socket.disconnect();
  }, [pageName]);

  const sendMessage = () => {
    if (!inputText.trim()) return;

    const msgPayload = {
      pageName,
      sender: mlUser.id,
      text: inputText,
    };

    socketRef.current.emit("sendMessage", msgPayload);
    setInputText(""); // clear input
  };


  if (profileChatPage) {
    // ProfileChat page
    return (
      <View style={{ flex: 1, padding: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
          <TouchableOpacity onPress={() => setProfileChatPage(false)} style={{ marginRight: 10 }}>
            <Ionicons name="arrow-back" size={24} color="black" />
          </TouchableOpacity>
          <Ionicons
            name={type === 'group' ? "people-circle" : "person-circle"} // 👈 Switch icon based on type
            size={30}
            color={currentPage === 'profile' ? '#2772BC' : 'grey'}
          />
          <Text style={{ fontSize: 18, fontWeight: 'bold', marginLeft: 10 }}>{title}</Text>
        </View>

        <View style={{ flex: 1 }}>
          <Text>This is the profile chat page for: {title}</Text>
          <Text style={{ marginTop: 10 }}>
            {/* Example bio */}
            {bio}
          </Text>
          <Text style={{ marginTop: 10 }}>
            users:
          </Text>
        </View>
      </View>
    );
  }

  if (currentPage !== pageName) return null;

  return (
    <View style={{
          height: Dimensions.get('window').height - 200, padding: 20 // subtract height of header/top bar
      }}
    >
      {/* Top row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
        <TouchableOpacity onPress={() => setCurrentPage(archived ? 'archived' : 'people')} style={{ marginRight: 10 }}>
          <Ionicons name="arrow-back" size={24} color="black" />
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setProfileChatPage(true)}>
          <Ionicons name={type === 'group' ? "people-circle" : "person-circle"} size={30} color={currentPage === 'profile' ? '#2772BC' : 'grey'} />
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setProfileChatPage(true)}>
          <Text style={{ fontSize: 18, fontWeight: 'bold', marginLeft: 10 }}>
            {title}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Messages */}
      <View style={{ flex: 1 }}>
        <ScrollView
          style={{ flex: 1, backgroundColor: 'lightgrey', borderRadius: 10 }}
          contentContainerStyle={{ padding: 20, paddingBottom: 80 }}
          ref={scrollViewRef}
          onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
        >
          {messages.length === 0 ? (
            <Text style={{ color: 'grey', textAlign: 'center', marginTop: 20 }}>
              No messages yet
            </Text>
          ) : (
            messages.map((msg) => (
              <View key={msg._id} style={{ marginBottom: 10 }}>
                <Text style={{ fontWeight: 'bold' }}>{msg.senderName}</Text>
                <Text>{msg.text}</Text>
              </View>
            ))
          )}
        </ScrollView>
      </View>

      {/* Input at bottom */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingTop: 10,
        borderColor: '#ccc',
        backgroundColor: 'white',
      }}>
        <TextInput
          placeholder="Shoot a text"
          value={inputText}
          onChangeText={setInputText}
          style={{
            flex: 1,
            height: 40,
            borderWidth: 1,
            borderColor: '#ccc',
            borderRadius: 10,
            paddingHorizontal: 10,
            backgroundColor: 'white',
          }}
        />
        <TouchableOpacity onPress={sendMessage} style={{ marginLeft: 10 }}>
          <Ionicons name="send" size={24} color="black" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

export function ExpandableGroup({ item, onAddUser, onToggle, expanded, setCurrentPage }) {
  const { name, bio, type } = item;
  const isPerson = type === 'person';

  return (
    <TouchableOpacity
      onPress={onToggle}
      style={{
        backgroundColor: '#f0f0f0',
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 15,
        height: expanded ? 230 : 60,
        justifyContent: 'flex-start',
        marginBottom: 6,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', height: 30 }}>
        <Ionicons
          name={isPerson ? 'person-circle' : 'people'}
          size={30}
          color="black"
        />
        <Text style={{ marginLeft: 10, fontSize: 18 }}>{name}</Text>

        <View style={{ flex: 1, alignItems: 'flex-end', marginRight: 5 }}>
          <TouchableOpacity onPress={() => onAddUser(item)}>
            <Ionicons name="add-circle" size={30} color="black" />
          </TouchableOpacity>
        </View>
      </View>

      {expanded && (
        <>
          <View
            style={{
              height: 120,
              paddingHorizontal: 10,
              backgroundColor: 'white',
              borderRadius: 8,
              marginTop: 10,
              justifyContent: 'center',
            }}
          />
          <View style={{ marginTop: 10, paddingHorizontal: 10 }}>
            <Text>{bio || (isPerson ? 'No bio available' : '')}</Text>
          </View>
        </>
      )}
    </TouchableOpacity>
  );
}

function TaskItem({
  text,
  checked,
  onToggle,
  onDelete,
  subtitle,
  subtasks,
  onPress,
  onToggleSubtask,
  onDeleteSubtask,
  onPressSubtask,
}) {
  return (
    <View style={{ marginBottom: 10 , maxWidth: '85%' }}>
      <TouchableOpacity onPress={onPress} style={styles.taskRow}>
        <TouchableOpacity onPress={onToggle} style={{ marginRight: 10 }}>
          <View style={styles.squareBox}>
            {checked && <Ionicons name="checkmark" size={20} color="grey" />}
          </View>
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
          <Text numberOfLines={3} style={[styles.taskText, checked && styles.strikedText]}>
            {text}
          </Text>
          {subtitle ? (
            <Text 
              numberOfLines={1}
              ellipsizeMode="tail" 
              style={[styles.subtitleText, checked && styles.strikedText,]}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>

      {subtasks?.length > 0 && (
        <View style={{ marginLeft: 33, marginTop: 8 }}>
          {subtasks.map((sub, idx) => (
            <View
              key={idx}
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start', // changed to flex-start for desc multiline
                marginBottom: 6,
              }}>
              <TouchableOpacity
                onPress={() => onToggleSubtask(idx)}
                style={styles.subtaskBox}>
                {(checked || sub.checked) && (
                  <Ionicons name="checkmark" size={14} color="grey" />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => onPressSubtask(idx)}
                style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.subtaskText,
                    (checked || sub.checked) && styles.strikedText,
                    { marginLeft: 10 },
                  ]}>
                  {sub.text}
                </Text>

                {sub.desc ? (
                  <Text 
                    numberOfLines={1}
                    ellipsizeMode="tail"
                    style={[
                      styles.subtitleText,
                      (checked || sub.checked) && styles.strikedText,
                      { marginLeft: 10, marginTop: 2},
                    ]}>
                    {sub.desc}
                  </Text>
                ) : null}
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function ArchivedBar({ setCurrentPage }) {
  return (
    <TouchableOpacity onPress={() => setCurrentPage('archived')}>
      <View style={styles.archiveBox}>
        <Ionicons name="archive" size={24} color="grey" />
        <Text style={styles.archiveText}>Archived</Text>
      </View>
    </TouchableOpacity>
  );
}

export function ExpandableBlock({
  goalTitle,
  streakNumber,
  Currentstreak,
  longeststreak,
  consistency,
  weekStreak,
  weekConsistency,
  daysPerWeek,
  workoutCompleted,
  expanded,
  onPress,
  onDeleteGoal,
  onEditGoalPage,
  goalDates,
}) {
  const animation = useMemo(() => new Animated.Value(0), []);
  const [showDropdown, setShowDropdown] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const doneCount = countDone(goalDates, daysPerWeek);
  const doneThisWeek = countThisWeek(goalDates, daysPerWeek);

  const dropdownStyle = {
    position: 'absolute',
    top: 42, // right below the button
    right: 20, // aligned to the right edge
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 5,
    paddingVertical: 2,
    paddingHorizontal: 12,
    zIndex: 1000,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    alignItems: 'flex-start', // left align text inside dropdown
  };


  useEffect(() => {
    Animated.timing(animation, {
      toValue: expanded ? 1 : 0,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, [expanded, animation]);

  useEffect(() => {
    if (!expanded) {
      setShowDropdown(false);
      setConfirmDelete(false);
    }
  }, [expanded]);

  const screenWidth = Dimensions.get('window').width;
  const cellSize = screenWidth > 700 ? 40 : 32;

  const inner = Math.round(cellSize * 0.75);
  const fontSize = Math.round(cellSize * 0.28);
  const fontSize2 = fontSize*1.5

  const [editMode, setEditMode] = useState(false);
  const [editTitle, setEditTitle] = useState(goalTitle);
  const [editDays, setEditDays] = useState(daysPerWeek.toString());



  const renderCalendar = () => {
    const year = new Date().getFullYear();
    const month = new Date().getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayWeekDay = (new Date(year, month, 1).getDay() + 6) % 7;
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    const totalCells = 35;

    let dayItems = [];

    for (let i = 0; i < totalCells; i++) {
      let day = null;
      let isCurrentMonth = true;

      if (i < firstDayWeekDay) {
        day = daysInPrevMonth - firstDayWeekDay + 1 + i;
        isCurrentMonth = false;
      } else if (i >= firstDayWeekDay + daysInMonth) {
        day = i - (firstDayWeekDay + daysInMonth) + 1;
        isCurrentMonth = false;
      } else {
        day = i - firstDayWeekDay + 1;
      }

      const today = new Date();
      const isToday =
        day === today.getDate() &&
        month === today.getMonth() &&
        year === today.getFullYear() &&
        isCurrentMonth;

      let cellYear = year;
      let cellMonth = month;

      if (i < firstDayWeekDay) {
        // previous month
        cellMonth = month - 1;
        if (cellMonth < 0) {
          cellMonth = 11;
          cellYear -= 1;
        }
      } else if (i >= firstDayWeekDay + daysInMonth) {
        // next month
        cellMonth = month + 1;
        if (cellMonth > 11) {
          cellMonth = 0;
          cellYear += 1;
        }
      }

      const dayString = `${cellYear}-${String(cellMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayDate = new Date(dayString);
      const firstGoalDate = (goalDates && goalDates.length) 
        ? new Date(goalDates[0]) 
        : new Date(); // fallback naar vandaag

      // Determine if this day should show a check
      let isChecked = false;

      if (daysPerWeek === 0 && firstGoalDate) {
        const dayDateObj = new Date(dayString);
        const today = new Date();

        // strip time parts
        dayDateObj.setHours(0, 0, 0, 0);
        const firstGoalDateObj = new Date(firstGoalDate);
        firstGoalDateObj.setHours(0, 0, 0, 0);
        today.setHours(0, 0, 0, 0);

        if (dayDateObj >= firstGoalDateObj && dayDateObj <= today) {
          // Quit goal: check if there is NO completion on this day
          const hasCompletion = (goalDates || []).some(
            date => date.slice(0, 10) === dayString
          );
          isChecked = !hasCompletion; // green check for skipped days
        }
      } else {
        // Normal goal: check if there is a completion
        isChecked = (goalDates || []).some(
          date => date.slice(0, 10) === dayString
        );
      }


      dayItems.push(
        <View
          style={{
            width: cellSize,
            height: cellSize,
            borderRadius: cellSize/2,
            backgroundColor: 'lightgrey',
            marginVertical: 1,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: isCurrentMonth ? 1 : 0.3,
          }}
        >
          <View
            style={{
              width: inner,
              height: inner,
              borderRadius: inner / 2,
              backgroundColor: isChecked ? 'lightgreen' : 'white',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
            }}
          >
            <Text
              style={{
                fontSize,
                color: 'grey',
                position: 'absolute',
                opacity: isChecked ? 0.4 : 1,
              }}
            >
              {day}
            </Text>
            {isChecked && (
              <Ionicons name="checkmark" size={20} color="darkgreen" />
            )}
          </View>
        </View>
      );
    }

    return dayItems;
  };

  return (
    <View style={{ position: 'relative' }}>

      {!goalTitle || goalTitle.trim() === "" ? (
        <Text>There are no goals</Text>
      ) : (
        <>
          {/* Dropdown */}
          {showDropdown && !confirmDelete && !editMode && (
            <View style={dropdownStyle}>
              <TouchableOpacity
                onPress={() => onEditGoalPage()} 
                style={{ padding: 10 }}
              >
                <Text style={{ color: 'blue' }}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setConfirmDelete(true)}
                style={{ padding: 10 }}
              >
                <Text style={{ color: 'red' }}>Delete</Text>
              </TouchableOpacity>
            </View>
          )}


          {/* Delete confirmation modal */}
          {confirmDelete && (
            <View style={styles.modalOverlay}>
              <View style={styles.modalContainer}>
                <Text style={{ marginBottom: 15 }}>Are you sure?</Text>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-around',
                    width: '100%',
                  }}
                >
                  <TouchableOpacity
                    onPress={() => {
                      setConfirmDelete(false);
                      setShowDropdown(false);
                    }}
                    style={styles.modalButton}
                  >
                    <Text>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      onDeleteGoal();
                      setConfirmDelete(false);
                      setShowDropdown(false);
                    }}
                    style={[styles.modalButton, { backgroundColor: 'red' }]}
                  >
                    <Text style={{ color: 'white' }}>Yes</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          <TouchableOpacity onPress={onPress}>
            <View
              style={{
                padding: 20,
                marginBottom: 10,
                backgroundColor: '#eee',
                borderRadius: 10,
                height: expanded ? 355 : 270,
                justifyContent: 'flex-start',
              }}
            >
              {/* Header */}
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontWeight: 'bold', fontSize: 25 }}>{goalTitle}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  {expanded ? (
                    <TouchableOpacity
                      onPress={() => setShowDropdown(!showDropdown)}
                    >
                      <Ionicons name="ellipsis-horizontal" size={24} color="#000" />
                    </TouchableOpacity>
                  ) : (
                    <>
                      <Text style={{ fontWeight: 'bold', fontSize: 20 }}>
                        {doneCount}
                      </Text>
                      <Ionicons name="checkmark-sharp" size={25} color="green" />
                    </>
                  )}
                </View>
              </View>

              {/* Stats */}
              {expanded && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
                  <View>
                    <Text style={{ marginTop: 5 }}>Days per week:</Text>
                    {/* <Text style={{ marginTop: 10 }}>Current streak:</Text> */}
                    {/* <Text style={{ marginTop: 5 }}>Longest streak:</Text> */}
                    {/* <Text style={{ marginTop: 5 }}>Consistency:</Text> */}
                    <Text style={{ marginTop: 10 }}>Week streak:</Text> 
                    <Text style={{ marginTop: 5 }}>Week consistency:</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ marginTop: 5 }}>
                      {`${doneThisWeek}/${daysPerWeek}`}
                    </Text>
                    {/* <Text style={{ marginTop: 10 }}>{Currentstreak}</Text> */}
                    {/* <Text style={{ marginTop: 5 }}>{longeststreak}</Text> */}
                    {/* <Text style={{ marginTop: 5 }}>{consistency}</Text> */}
                    <Text style={{ marginTop: 10 }}>{weekStreak} {weekStreak === 1 ? 'week' : 'weeks'}, ({weekStreak * 7} days)</Text>
                    <Text style={{ marginTop: 5, marginBottom: 5 }}>{weekConsistency}</Text>
                  </View>
                </View>
              )}

              {/* Days row */}
              <View style={{ flexDirection: 'row', width: '100%', marginTop: 10 }}>
                {['Mo','Tu','We','Th','Fr','Sa','Su'].map((day,i) => (
                  <Text
                    key={i}
                    style={{
                      fontSize2,
                      fontWeight: 'bold',
                      color: 'grey',
                      textAlign: 'center',   // center inside its column
                      width: '14.28%',       // 7 equal columns
                    }}
                  >
                    {day}
                  </Text>
                ))}
              </View>

              {/* Calendar grid */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: '100%', marginTop: 5 }}>
                {renderCalendar().map((dayComponent, i) => (
                  <View
                    key={i}
                    style={{
                      width: '14.28%',      // same as labels
                      alignItems: 'center', // center circle in the column
                      marginVertical: 0.5,
                    }}
                  >
                    {dayComponent}
                  </View>
                ))}
              </View>
            </View>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

function countDone(dates, daysPerWeek) {
  if (daysPerWeek === 0) {
    if (!dates.length) return 0;

    const firstDate = new Date(dates[0]);
    const lastDate = new Date();
    let count = 0;

    for (
      let d = new Date(firstDate);
      d <= lastDate;
      d.setDate(d.getDate() + 1)
    ) {
      const dayString = d.toISOString().split('T')[0];
      if (!dates.some(date => date.slice(0, 10) === dayString)) {
        count++;
      }
    }
    return count;
  } else {
    return dates.length;
  }
}


function calculateStreaks(dates, completionsPerWeek) {
  if (!dates.length) {
    return {
      currentStreak: 0,
      longestStreak: 0,
      consistency: '0%',
      weekStreak: 0,
      longestWeekStreak: 0,
      weekConsistency: '0%'
    };
  }

  // --- Deduplicate per calendar day for daily streaks ---
  const uniqueDates = Array.from(
    new Set(dates.map(d => new Date(d).toISOString().split('T')[0]))
  );
  const sorted = uniqueDates.slice().sort();

  // ----- DAILY STREAKS -----
  let longest = 1;
  let current = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1]);
    const curr = new Date(sorted[i]);
    const diffDays = (curr - prev) / (1000 * 60 * 60 * 24);
    if (diffDays === 1) current++;
    else current = 1;
    if (current > longest) longest = current;
  }

  const lastDate = new Date(sorted[sorted.length - 1]);
  const today = new Date();
  const diffLastToday = (today - lastDate) / (1000 * 60 * 60 * 24);
  if (diffLastToday > 1) current = 0;

  // Daily consistency
  const firstDate = new Date(sorted[0]);
  const totalDays = Math.floor((today - firstDate) / (1000 * 60 * 60 * 24)) + 1;
  const consistencyPercent = Math.round((sorted.length / totalDays) * 100);

  // ----- WEEKLY STREAKS (completions-based) -----
  const weeks = {};
  dates.forEach(dateStr => {
    const d = new Date(dateStr);
    const year = d.getFullYear();
    const week = getWeekNumber(d);
    const key = `${year}-W${week}`;

    if (!weeks[key]) weeks[key] = 0;
    weeks[key]++; // count all completions, even same day
  });

  // If quit goal → fill in missing weeks with 0 completions
  if (completionsPerWeek === 0 && dates.length) {
    const first = new Date(dates[0]);
    const last = new Date(); // go until today
    let current = new Date(first);

    while (current <= last) {
      const year = current.getFullYear();
      const week = getWeekNumber(current);
      const key = `${year}-W${week}`;
      if (!weeks[key]) weeks[key] = 0; // ensure skipped week exists
      current.setDate(current.getDate() + 7); // jump by 7 days
    }
  }

  const weekKeys = Object.keys(weeks).sort();
  let weekStreak = 0;
  let longestWeekStreak = 0;
  let successfulWeeks = 0;

  let lastWeekIndex = null;
  weekKeys.forEach(wk => {
    const [year, weekStr] = wk.split('-W');
    const weekIndex = parseInt(year) * 52 + parseInt(weekStr); // simple index

    let success = false;
    if (completionsPerWeek === 0) success = weeks[wk] === 0;
    else success = weeks[wk] >= completionsPerWeek;

    if (success) {
      if (lastWeekIndex !== null && weekIndex !== lastWeekIndex + 1) {
        weekStreak = 1; // reset if not consecutive
      } else {
        weekStreak++;
      }
      if (weekStreak > longestWeekStreak) longestWeekStreak = weekStreak;
      successfulWeeks++;
    } else {
      weekStreak = 0;
    }

    lastWeekIndex = weekIndex;
  });


  const weekConsistency = weekKeys.length
    ? Math.round((successfulWeeks / weekKeys.length) * 100) + '%'
    : '0%';

  return {
    currentStreak: current,
    longestStreak: longest,
    consistency: consistencyPercent + '%',
    weekStreak,
    longestWeekStreak,
    weekConsistency
  };
}

// ISO Week helper
function getWeekNumber(d) {
  const date = new Date(d.getTime());
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 4 - (date.getDay() || 7)); // Thursday
  const yearStart = new Date(date.getFullYear(), 0, 1);
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return weekNo;
}

// Count all entries in this week (duplicates allowed)
function countThisWeek(dates) {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 = Sunday
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  startOfWeek.setHours(0,0,0,0);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23,59,59,999);

  return dates.filter(d => {
    const date = new Date(d);
    return date >= startOfWeek && date <= endOfWeek;
  }).length;
}

// Weekly streak only checks unique days per week
function calculateWeekStreak(dates, completionsPerWeek) {
  const weeks = {};

  dates.forEach(dateStr => {
    const d = new Date(dateStr);
    const year = d.getFullYear();
    const week = getWeekNumber(d);
    const key = `${year}-W${week}`;

    if (!weeks[key]) weeks[key] = 0;
    weeks[key]++; // count every completion, even same day
  });

  const weekKeys = Object.keys(weeks).sort();
  let weekStreak = 0;
  let longestWeekStreak = 0;

  weekKeys.forEach(wk => {
    if (weeks[wk] >= completionsPerWeek) {
      weekStreak++;
      if (weekStreak > longestWeekStreak) longestWeekStreak = weekStreak;
    } else {
      weekStreak = 0;
    }
  });

  return { weekStreak, longestWeekStreak };
}

export default function App() {
  const redirectUri = AuthSession.makeRedirectUri({ useProxy: true });

  const [request, response, promptAsync] = Google.useAuthRequest({
    expoClientId: '714454103672-f0004f5jh3lrdmgvnf8m0j1u5tn6eo7g.apps.googleusercontent.com',
    iosClientId: '714454103672-4qgidei58nta6hd5sgts6e32f1g3jg7t.apps.googleusercontent.com', // 👈 toevoegen
    androidClientId: '714454103672-4a81a43pgeocj7o0jbkp2mgkbat9v4ko.apps.googleusercontent.com',
    webClientId: '714454103672-4a81a43pgeocj7o0jbkp2mgkbat9v4ko.apps.googleusercontent.com',
    redirectUri,
  });

  useEffect(() => {
    if (response?.type === 'success') {
      const { id_token } = response.params;
      const credential = GoogleAuthProvider.credential(id_token);
      signInWithCredential(auth, credential)
        .then(user => console.log('Ingelogd als:', user.user.displayName))
        .catch(console.error);
    }
  }, [response]);

  const [tasks, setTasks] = useState([
    {
      text: 'Goal - Workout',
      desc: 'Go till you drop down',
      timeTaken: 0,
      startTime: Date.now(), // start immediately
      subtasks: [
        { text: 'Pushups', desc: 'Do 3 sets', checked: false },
        { text: 'Pullups', desc: 'Minimum 5', checked: false },
      ],
    },
    {
      text: 'Do the dishes',
      desc: '',
      timeTaken: 0,
      startTime: Date.now(), // start immediately
      subtasks: [],
    },
  ]);

  const [checkedStates, setCheckedStates] = useState(
    Array(tasks.length).fill(false)
  );
  const [doneTasks, setDoneTasks] = useState([]);
  const [doneCollapsed, setDoneCollapsed] = useState(true);

  // States en functies voor subtaken bewerken
  const [selectedSubtask, setSelectedSubtask] = useState(null);
  const [editedSubtaskText, setEditedSubtaskText] = useState('');
  const [editedSubtaskDesc, setEditedSubtaskDesc] = useState('');
  const [showSubtaskDropdown, setShowSubtaskDropdown] = useState(false);

  const saveSubtaskInline = () => {
    if (!selectedSubtask) return;
    const updated = [...tasks];
    const { taskIdx, subIdx } = selectedSubtask;
    updated[taskIdx].subtasks[subIdx].text = editedSubtaskText;
    updated[taskIdx].subtasks[subIdx].desc = editedSubtaskDesc;
    setTasks(updated);
  };

  const updateSubtaskChecked = (taskIdx, subIdx) => {
    const updated = [...tasks];
    updated[taskIdx].subtasks[subIdx].checked =
      !updated[taskIdx].subtasks[subIdx].checked;
    setTasks(updated);
  };

  const deleteSubtask = (taskIdx, subIdx) => {
    const updated = [...tasks];
    updated[taskIdx].subtasks.splice(subIdx, 1);
    setTasks(updated);
  };

  // Taken toevoegen en verwijderen
  const [addingTask, setAddingTask] = useState(false);
  const [newTaskText, setNewTaskText] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [filteredSuggestions, setFilteredSuggestions] = useState([]);

  const handleAddSuggestionTask = (taskText) => {
    if (taskText.trim()) {
      const newTask = {
        text: taskText,
        desc: '',
        subtasks: [],
        startTime: Date.now(),  // start timer immediately
        timeTaken: 0,
      };

      setTasks([newTask, ...tasks]);
      setCheckedStates([false, ...checkedStates]);
      setNewTaskText('');
      setIsAddingTask(false);
      setFilteredSuggestions([]);
    }
  };

  const handleAddTask = () => {
    if (newTaskText.trim()) {
      setTasks([
        {
          text: newTaskText,
          desc: newTaskDesc,
          subtasks: [],
          startTime: Date.now(), // start timer immediately
          timeTaken: 0       // NEW
        },
        ...tasks,
      ]);
      setCheckedStates([false, ...checkedStates]);
      setNewTaskText('');
      setNewTaskDesc('');
      setAddingTask(false);
    }
  };

  const handleDelete = (index) => {
    const newTasks = tasks.filter((_, i) => i !== index);
    const newChecks = checkedStates.filter((_, i) => i !== index);
    setTasks(newTasks);
    setCheckedStates(newChecks);
    setSelectedTask(null);
    setCurrentPage('home');
  };

  // Taken afvinken en ongedaan maken
  const toggleCheckTask = (index) => {
    const updatedTasks = [...tasks];
    const taskToMove = updatedTasks[index];

    // Start timer if not started yet
    if (!taskToMove.startTime) {
      taskToMove.startTime = Date.now();
    }

    // Calculate minutes spent
    const elapsedSeconds = Math.round((Date.now() - taskToMove.startTime) / 1000);
    taskToMove.timeTaken = elapsedSeconds;

    // alert(`You spent ${elapsedSeconds} seconds on "${taskToMove.text}"`);

    setTasks(updatedTasks); // save updated time

    // Move task to doneTasks
    if (taskToMove.text.startsWith('Goal -')) {
      const goalTitle = taskToMove.text.replace('Goal - ', '');
      setGoals((prevGoals) =>
        prevGoals.map((goal) => {
          if (goal.title === goalTitle) {
            const updatedDates = [...goal.dates, new Date().toISOString()];
            const { currentStreak, longestStreak, consistency, weekStreak, longestWeekStreak, weekConsistency } =
              calculateStreaks(updatedDates, goal.daysPerWeek);

            return {
              ...goal,
              dates: updatedDates,
              streakNumber: currentStreak,
              Currentstreak: `${currentStreak}`,
              longeststreak: `${longestStreak} days`,
              consistency,
              weekStreak,
              weekConsistency,
              workoutCompleted: true,
            };
          }
          return goal;
        })
      );
    }

    // Move task into doneTasks list
    setDoneTasks([...doneTasks, taskToMove]);
    setTasks(tasks.filter((_, i) => i !== index));
    setCheckedStates(checkedStates.filter((_, i) => i !== index));

    if (taskToMove.text === 'Goal - Workout') setWorkoutCompleted(true);
  };

  const toggleUncheckDoneTask = (index) => {
    const taskToRestore = doneTasks[index];


    taskToRestore.startTime = Date.now();
    taskToRestore.timeTaken = 0;  // optional: reset or keep old time


    if (taskToRestore.text.startsWith('Goal -')) {
      const goalTitle = taskToRestore.text.replace('Goal - ', '');
      setGoals((prevGoals) =>
        prevGoals.map((goal) => {
          if (goal.title === goalTitle) {
            // Remove the last completion
            const updatedDates = [...goal.dates];
            updatedDates.pop();
            const {
              currentStreak,
              longestStreak,
              consistency,
              weekStreak,
              longestWeekStreak,
              weekConsistency
            } = calculateStreaks(updatedDates, goal.daysPerWeek);

            return {
              ...goal,
              dates: updatedDates,
              streakNumber: currentStreak,
              Currentstreak: `${currentStreak}`,
              longeststreak: `${longestStreak} days`,
              consistency,
              weekStreak,
              weekConsistency,
              workoutCompleted: updatedDates.length > 0,
            };
          }
          return goal;
        })
      );
    }

    if (taskToRestore.text === 'Goal - Workout') {
      setWorkoutCompleted(false);
    }

    setTasks([...tasks, taskToRestore]);
    setCheckedStates([...checkedStates, false]);
    setDoneTasks(doneTasks.filter((_, i) => i !== index));
  };

  // Overige states
  const [expandedTitle, setExpandedTitle] = useState(null);
  const [expandedGoalIndex, setExpandedGoalIndex] = useState(null);
  const [showAddSubtask, setShowAddSubtask] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [editedText, setEditedText] = useState('');
  const [editedDesc, setEditedDesc] = useState('');
  const [subtaskFromTaskModal, setSubtaskFromTaskModal] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [newSubtask, setNewSubtask] = useState('');

  const [currentPage, setCurrentPage] = useState('home');

  {/* 
  const [goalDates, setGoalDates] = React.useState({
    "Goal - Workout": ["2025-08-16", "2025-08-10", "2025-08-02"]
  });
  */}

  {/* 
  const [streaks, setStreaks] = useState({
    currentStreak: 0,
    longestStreak: 0,
    consistency: '0%',
  });
  */}

  const [newGoalTitle, setNewGoalTitle] = useState('');
  const [newGoalDays, setNewGoalDays] = useState('');
  const [isAddingTask, setIsAddingTask] = useState(false);

  const [workoutCompleted, setWorkoutCompleted] = useState(false);

  const [goals, setGoals] = useState([
    {
      title: 'Workout',
      daysPerWeek: 1,
      streakNumber: 0,
      Currentstreak: '0',
      longeststreak: '0 days',
      consistency: '0%',
      weekStreak: 0,
      weekConsistency: '0%',
      workoutCompleted: false,
      dates: [
        "2025-08-10T08:00:00.000Z",
        "2025-08-11T10:15:00.000Z",
        "2025-08-12T14:30:00.000Z",
        "2025-08-13T09:00:00.000Z",
      ],
      weeks: [
        "2025-W31",
        "2025-W32",
      ],
    },
  ]);



  //ALL DATA
  const [search, setSearch] = useState('');

  const [items, setItems] = React.useState([
    {
      name: 'Gymboys',
      page: 'gymboys',
      bio: 'Workout crew',
      type: 'group',
      status: 'active',
    },
    {
      name: 'Jake',
      page: 'jake',
      bio: 'Cool guy',
      type: 'person',
      status: 'active',
    },
    {
      name: 'Foodies',
      page: 'foodies',
      bio: 'Loves food',
      type: 'group',
      status: 'active', // changed
    },
    {
      name: 'Henk',
      page: 'henkies',
      bio: 'loves moving',
      type: 'person',
      status: 'active', // changed
    },
    {
      name: 'Gerda',
      page: 'Gerda',
      bio: 'he is my favorite person',
      type: 'person',
      status: 'active',
    },
  ]);

  const filteredList = items.filter(
    i =>
      i.status === "suggested" &&
      i.name.toLowerCase().includes(search.toLowerCase()) &&
      i.page !== mlUser?.id
  );

  const [peoplePages, setPeoplePages] = useState([
    'people',
    'archived',
    'gymboys',
    'travelgang',
    'futureyou',
    'jake',
    'addpeople',
  ]);

  const [algorithmResult, setAlgorithmResult] = useState(null);
  const [mlUser, setMlUser] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [allGroups, setAllGroups] = useState([]);
  const [allGroupsDB, setAllGroupsDB] = useState([]);

  const [userId, setUserId] = useState(null);
  const [userName, setUserName] = useState(""); // stores name from input

  const [debouncedName, setDebouncedName] = useState(userName);

  const [userBio, setUserBio] = useState(""); 
  const [debouncedBio, setDebouncedBio] = useState(userBio);

  // debounce bio
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedBio(userBio);
    }, 1000);
    return () => clearTimeout(handler);
  }, [userBio]);

  // this make the algrotihm wait untill you stopped typing youre name
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedName(userName);
    }, 1000); // 1000ms after last keystroke

    return () => clearTimeout(handler); // reset timeout if typing continues
  }, [userName]);

  const [myRanking, setMyRanking] = useState([]);




  const handleAddAndMove = async (item) => {
    const pageName = getPageName(item);

    console.log("🟡 Adding item:", item);
    moveItem(pageName, 'active');
    handleAddUser(item);

    try {
      const res = await fetch("http://192.168.1.2:5000/saveActive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          connection: {
            id: item.id,
            type: item.type,
            page: pageName // ✅ gebruik consistente pageName
          }
        })
      });

      const data = await res.json();
      console.log("✅ SaveActive response:", data);
    } catch (err) {
      console.error("❌ Frontend fetch error:", err);
    }
  };


  useEffect(() => {
    if (!userId) return;

    const loadActive = async () => {
      const res = await fetch(`http://192.168.1.2:5000/getActive/${userId}`);
      const data = await res.json();

      // fetch full user/group info
      const allUsersRes = await fetch("http://192.168.1.2:5000/users");
      const allGroupsRes = await fetch("http://192.168.1.2:5000/groups");
      const [users, groups] = await Promise.all([allUsersRes.json(), allGroupsRes.json()]);

      const formatted = data.map(c => {
        let name = "";
        let bio = "";
        if (c.type === "person") {
          const user = users.find(u => u.id === c.id);
          if (user) { name = user.name; bio = user.bio; }
        } else {
          const group = groups.find(g => g.id === c.id);
          if (group) { name = group.name; bio = group.bio; }
        }
        return {
          id: c.id,
          type: c.type,
          page: c.page,   // ✅ keep the page from DB
          name,
          bio,
          status: "active"
        };
      }).filter(Boolean);

      setItems(prev => {
        const merged = [...prev];

        // Merge or add new items
        formatted.forEach(f => {
          const existingIndex = merged.findIndex(i => i.page === f.page); // match by page
          if (existingIndex > -1) {
            merged[existingIndex] = { ...merged[existingIndex], ...f };
          } else {
            merged.push(f);
          }
        });

        // --- Remove duplicates by name, prioritize active, prefer longer IDs ---
        const ensureId = (item) =>
          item.id ? item : { ...item, id: `${item.name}_${Math.random().toString(36).slice(2)}_${Date.now()}` };

        const allItems = merged.map(ensureId);
        const priority = (s) => (s === "active" ? 3 : s === "suggested" ? 2 : 1);
        const nameBest = new Map();

        for (const item of allItems) {
          const existing = nameBest.get(item.name);

          if (!existing) {
            nameBest.set(item.name, item);
            continue;
          }

          const pItem = priority(item.status);
          const pExisting = priority(existing.status);

          let winner = existing;

          if (pItem > pExisting) {
            winner = item;
          } else if (pItem === pExisting) {
            // same status → prefer longer ID
            winner = existing.id.length > item.id.length ? existing : item;
          }

          nameBest.set(item.name, winner);
        }

        return Array.from(nameBest.values());
      });


    };

    loadActive();
  }, [userId]);

  // Call once on mount


  const removeSuggestedIfActiveDuplicate = (items) => {
    const ensureId = (item) =>
      item.id ? item : { ...item, id: `${item.name}_${Math.random().toString(36).slice(2)}_${Date.now()}` };

    const allItems = items.map(ensureId);

    const priority = (s) => (s === "active" ? 3 : s === "suggested" ? 2 : 1);
    const nameBest = new Map();

    for (const item of allItems) {
      const existing = nameBest.get(item.name);

      if (!existing) {
        nameBest.set(item.name, item);
        continue;
      }

      const pItem = priority(item.status);
      const pExisting = priority(existing.status);

      let winner = existing;

      if (pItem > pExisting) {
        winner = item;
      } else if (pItem === pExisting) {
        // same status → prefer longer ID
        winner = existing.id.length > item.id.length ? existing : item;
      }

      nameBest.set(item.name, winner);
    }

    return Array.from(nameBest.values());
  };

  // Run algorithm whenever userId, tasks, or goals change
  useEffect(() => {
    if (!userId || !tasks || !goals) return;
    
    const setupAndRun = async () => {
      console.log("⚡ useEffect triggered (setup + algorithm)");
      
      const userData = {
        id: userId,
        name: debouncedName || `User${Math.floor(10000000 + Math.random() * 90000000)}`, // fallback when no name its a user
        Country: "NL",
        time_zone: "CET",
        bio: debouncedBio || "This is my bio.", // ✅ use debouncedBio
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

      try {
        // update user
        await fetch("http://192.168.1.2:5000/updateUser", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(userData),
        });

        // get all users + groups
        const [usersRes, groupsRes] = await Promise.all([
          fetch("http://192.168.1.2:5000/users"),
          fetch("http://192.168.1.2:5000/groups"),
        ]);

        const [usersData, groupsData] = await Promise.all([
          usersRes.json(),
          groupsRes.json(),
        ]);

        // ❌ Remove current user
        const filteredUsers = usersData.filter(u => u.id !== userId);

        setAllUsers(filteredUsers);
        setAllGroupsDB(groupsData);

        // ✅ Run algorithm after both are loaded
        const algRes = await fetch("http://192.168.1.2:5000/algorithm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: "Which user should be matched?" }),
        });
        const algData = await algRes.json();
        setAlgorithmResult(algData);

        const myId = userData.id;
        const myRankings = algData.combined_best_to_worst?.[myId] || [];
        const myGroupRankings = myRankings.filter(item => item.type === "group");
        setMyRanking(myGroupRankings);

        console.log("📌 algData for user:", algData.combined_best_to_worst[userId]);

        // Map users + groups into items
        const mappedUsers = filteredUsers.map(u => ({
          id: u.id,
          name: u.name,
          bio: u.bio || "",
          type: "person",
          page: u.id,
          status: "suggested",
        }));

        const mappedGroups = groupsData.map(g => ({
          id: g.id,
          name: g.name,
          bio: g.bio || "",
          type: "group",
          page: g.id,
          status: "suggested",
        }));

        console.log("📦 groupsData from DB:", groupsData);

        // Build ranked items from algorithm
        //const userAlgData = algData.combined_best_to_worst?.[userId] || [];
        const rankedItems = algData.combined_best_to_worst[userId]
          .map(r => {
            if (r.type === "group") {
              const g = groupsData.find(g => g.id === r.id);
              if (!g) return null;
              return { id: g.id, name: g.name, bio: g.bio, type: "group", page: g.id, status: "suggested" };
            } else if (r.type === "user") {
              const u = filteredUsers.find(u => u.id === r.id); // <-- use r.id
              if (!u) return null;
              return { id: u.id, name: u.name, bio: u.bio, type: "person", page: u.id, status: "suggested" };
            }
            return null;
          })
          .filter(Boolean);

        // Merge with existing items
        setItems(prev => {
          const ensureId = item =>
            item.id
              ? item
              : { ...item, id: `${item.name}_${Math.random().toString(36).slice(2)}_${Date.now()}` };

          const prevWithIds = prev.map(ensureId);
          const rankedWithIds = rankedItems.map(ensureId);

          // Collect IDs of ranked/suggested items
          const suggestedIds = new Set(rankedWithIds.map(i => i.id));

          // Remove ONLY suggested items that match suggested IDs
          const cleaned = prevWithIds.filter(item => {
            const isMatch = suggestedIds.has(item.id);
            if (item.status !== "suggested") return true;
            return !isMatch;
          });

          // Add suggested items if not already present
          const existingIds = new Set(cleaned.map(i => i.id));
          const toAdd = rankedWithIds.filter(i => !existingIds.has(i.id));

          const merged = [...cleaned, ...toAdd];

          // --- Deduplicate by name + single-digit ID removal ---
          const priority = s => (s === "active" ? 3 : s === "suggested" ? 2 : 1);
          const nameBest = new Map();

          for (let i = merged.length - 1; i >= 0; i--) {
            const it = merged[i];
            const existing = nameBest.get(it.name);
            if (!existing) {
              nameBest.set(it.name, it);
              continue;
            }

            const pIt = priority(it.status);
            const pExist = priority(existing.status);

            // higher priority wins
            let winner = existing;
            if (pIt > pExist) {
              winner = it;
            } else if (pIt === pExist) {
              // kies degene met longer ID
              winner = existing.id.length > it.id.length ? existing : it;
            }

            nameBest.set(it.name, winner);
          }

          // final list: keep only the best item per name
          const finalList = merged.filter(it => nameBest.get(it.name) === it);

          return finalList;
        });
      } catch (err) {
        console.error("❌ Setup or algorithm error:", err);
      }
    };

    setupAndRun();
  }, [tasks, goals, userId, debouncedName]); // reruns when changes are made
  
  // 🔁 Auto-refresh user + group names every 10 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const [usersRes, groupsRes] = await Promise.all([
          fetch("http://192.168.1.2:5000/users"),
          fetch("http://192.168.1.2:5000/groups"),
        ]);

        const [usersData, groupsData] = await Promise.all([
          usersRes.json(),
          groupsRes.json(),
        ]);

        setItems(prev => {
          const current = currentPage; // bewaar actieve chat

          const updated = prev.map(item => {
            if (!item.id) return item;

            if (item.type === "person") {
              const user = usersData.find(u => u.id === item.id);
              if (user) return { ...item, name: user.name, bio: user.bio };
            }

            if (item.type === "group") {
              const group = groupsData.find(g => g.id === item.id);
              if (group) return { ...item, name: group.name, bio: group.bio };
            }

            return item;
          });

          setCurrentPage(current); // herstel actieve chat
          return updated;
        });

      } catch (err) {
        console.error("❌ Auto-refresh name update error:", err);
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [currentPage]);

  // Use a fixed test user ID
  useEffect(() => {
    //generateUniqueId();
    const fixedId = "64491717"; // replace with the user ID from your DB
    setUserId(fixedId);
  }, []);
  
  const generateUniqueId = async () => {
    try {
      // Get all existing user IDs
      const res = await fetch("http://192.168.1.2:5000/usersID");
      const existingIds = await res.json(); // array of strings or numbers

      let newId;
      do {
        newId = Math.floor(10000000 + Math.random() * 90000000).toString(); // 8-digit number
      } while (existingIds.includes(newId));

      console.log("🆕 Unique userId generated:", newId);
      setUserId(newId);
    } catch (err) {
      console.error("❌ Error fetching existing IDs:", err);
    }
  };

  // CREATES UNIQUE ID
  const createUniquePageId = () =>
  `page-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  // CREATE CONSISTENT PAGE NAME
  // Consistente pageName voor chats tussen twee personen
  const getPageName = (item) => {
    if (item.type === "person") {
      return `chat_${[mlUser.id, item.id].sort().join("_")}`; // altijd dezelfde voor dezelfde users
    }
    // Voor groepen gebruik bestaande page of genereer nieuwe
    return item.page || `group-${item.id}`;
  };


  // HANDLE ADDING USER OR GROUP FOR SERVER
  const handleAddUser = async (item) => {
    try {
      const pageName = getPageName(item);

      if (item.type === "person") {
        await fetch("http://192.168.1.2:5000/addChat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            userId: mlUser.id, 
            addedUserId: item.id,
            pageName // ✅ stuur deze mee
          }),
        });
      } else if (item.type === "group") {
        await fetch("http://192.168.1.2:5000/addChat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            userId: mlUser.id, 
            groupId: item.id,
            pageName // ✅ stuur deze mee
          }),
        });
      }

      // Verwijder eventuele duplicaten en voeg toe
      setItems(prev => prev.filter(i => i.page !== pageName));
      handleAdd({ ...item, status: "active", page: pageName });

    } catch (err) {
      console.error("❌ Error adding:", err);
    }
  };


  // ADD ITEM LOCALLY
  const handleAdd = (item) => {
    const newPage = item.page || createUniquePageId();

    // Only add if it doesn’t already exist
    setItems((prev) => {
      // Remove suggested duplicates again just in case
      const filtered = prev.filter(i => !(i.id === item.id && i.status === "suggested"));

      const exists = filtered.some(i => i.page === newPage);
      if (exists) {
        return filtered.map(i => i.page === newPage ? { ...i, status: "active" } : i);
      }

      const newItem = {
        ...item,
        page: newPage,
        name: item.name || (item.type === 'group' ? 'New Group' : 'New Chat'),
        bio: item.bio || '',
        type: item.type || 'person',
        status: 'active',
        icon: item.type === "person" ? "person-circle" : "people",
        useMaterial: item.useMaterial ?? false,
        isPerson: item.type === 'person',
      };

      return [newItem, ...prev];
    });

    // Update pages
    setPeoplePages(prev => (prev.includes(newPage) ? prev : [...prev, newPage]));

    // Navigate
    setCurrentPage(newPage);
  };

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        console.log("youre in the last interval adding your person", err);
        const [usersRes, groupsRes] = await Promise.all([
          fetch("http://192.168.1.2:5000/users"),
          fetch("http://192.168.1.2:5000/groups"),
        ]);

        const [usersData, groupsData] = await Promise.all([
          usersRes.json(),
          groupsRes.json(),
        ]);

        setItems(prev => {
          return prev.map(item => {
            const updated = { ...item };

            if (item.type === "person") {
              const user = usersData.find(u => u.id === item.id);
              if (user) {
                updated.name = user.name;
                updated.bio = user.bio || updated.bio;
              }
            } else if (item.type === "group") {
              const group = groupsData.find(g => g.id === item.id);
              if (group) {
                updated.name = group.name;
                updated.bio = group.bio || updated.bio;
              }
            }

            return updated;
          });
        });

      } catch (err) {
        console.error("❌ Auto-refresh name update error:", err);
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [mlUser?.id]);








  // FILTERS
  const people = items.filter(
    (i) => i.type === 'person' && i.status === 'active'
  );
  const groups = items.filter(
    (i) => i.type === 'group' && i.status === 'active'
  );
  const archivedGroups = items.filter(
    (i) => i.type === 'group' && i.status === 'archived'
  );
  const archivedPeople = items.filter(
    (i) => i.type === 'person' && i.status === 'archived'
  );
  const suggestions = items.filter((i) => i.status === 'suggested');

  // Move item to a new status (works for anything)
  const moveItem = (pageName, newStatus) => {
    setItems((prev) =>
      prev.map((item) =>
        item.page === pageName ? { ...item, status: newStatus } : item
      )
    );
  };

      // Example usage:
      // moveItem('jake', 'suggestion'); // Moves Jake to suggestions
      // moveItem('gymboys', 'archived'); // Moves Gymboys to archived

  useEffect(() => {
    console.log("🧩 Current items:", items);
  }, [items]);

  // GOALS:
  const [editGoalIndex, setEditGoalIndex] = useState(null);
  const [editGoalTitle, setEditGoalTitle] = useState('');
  const [editGoalDays, setEditGoalDays] = useState('');

  const handleEditGoal = (index) => {
    setEditGoalIndex(index);
    setEditGoalTitle(goals[index].title);
    setEditGoalDays(goals[index].daysPerWeek.toString());
    setCurrentPage('editGoal');
  };

  // UI helpers

  function onToggle(title) {
    setExpandedTitle((prev) => (prev === title ? null : title));
  }

  const handleGoalPress = (index) => {
    setExpandedGoalIndex(expandedGoalIndex === index ? null : index);
  };

  useEffect(() => {
    const keyboardHideListener = Keyboard.addListener('keyboardDidHide', () => {
      if (newTaskText.trim() === '') {
        setIsAddingTask(false);
        setFilteredSuggestions([]);
      }
    });


    return () => keyboardHideListener.remove();
  }, [newTaskText]);

  const inputRef = useRef(null);
  const pressingAdd = useRef(false);

  useEffect(() => {
    if (showAddSubtask) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [showAddSubtask]);

  useEffect(() => {
    if (currentPage !== 'target') {
      setExpandedGoalIndex(null);
    }
  }, [currentPage]);


  useEffect(() => {
    if (currentPage !== 'home') {
      setIsAddingTask(false);
      setNewTaskText('');
      setFilteredSuggestions([]);
    }
  }, [currentPage]);

  {/* 

  {filteredList.map(item => (
    <ExpandableGroup
      key={item.page}
      item={item}
      onAddUser={handleAddUser}
      expanded={expandedTitle === item.page}
      onToggle={() => onToggle(item.page)}
      setCurrentPage={setCurrentPage}
    />
  ))}

  */}

  



  return (
    <View style={styles.container}>
      <View style={styles.line} />
      <View style={styles.contentWrapper}>
        <TouchableOpacity onPress={() => setCurrentPage('profile')}>
          <Ionicons
            name="person-circle"
            size={60}
            color={currentPage === 'profile' ? '#2772BC' : 'grey'}
          />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            if (currentPage === 'profile') {
              setCurrentPage('help');
            } else if (currentPage === 'home') {
              setIsAddingTask(true); // show input
              setFilteredSuggestions(goals.map((g) => `Goal - ${g.title}`)); // show suggestions immediately
            } else if (currentPage === 'people' || currentPage === 'archived') {
              setCurrentPage('addpeople'); // go to Suggestion page from people or archived
            } else if (currentPage === 'target' || currentPage === 'editGoal') {
              setCurrentPage('addGoal');
            } else if (currentPage === 'editTask') {
              setShowAddSubtask(true);
              setShowDropdown(false);
            }
          }}>
          <Ionicons
            name={
              currentPage === 'profile' || currentPage === 'help'
                ? 'information-circle'
                : 'add-circle'
            }
            size={60}
            color={currentPage === 'help' ? '#2772Bc' : 'grey'}
          />
        </TouchableOpacity>
      </View>

      {currentPage === 'addpeople' && (
        <View style={{ minHeight: Dimensions.get('window').height, flexGrow: 1, padding: 20}}> 
          {/* Back bar */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
            <TouchableOpacity onPress={() => setCurrentPage('people')}>
              <Ionicons name="arrow-back" size={24} color="black" />
            </TouchableOpacity>
            <Text style={{ fontSize: 20, fontWeight: 'bold', marginLeft: 10 }}>Add People</Text>
          </View>

          {/* Search bar */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              borderColor: '#ccc',
              borderWidth: 1,
              borderRadius: 10,
              paddingHorizontal: 10,
              height: 40,
              marginBottom: 15,
            }}
          >
            <TextInput
              placeholder="Search..."
              value={search}
              onChangeText={setSearch}
              style={{
                flex: 1,
                borderWidth: 0,
                outlineStyle: 'none',
              }}
            />
            <Ionicons name="search" size={20} color="grey" />
          </View>


          {/* Content: Search results OR Suggested */}
          {search.length > 0 ? (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 50 }}
              showsVerticalScrollIndicator={false}
            >
              {filteredList.length > 0 ? (
                filteredList.map((item) => (
                  <ExpandableGroup
                    key={item.page}
                    item={item}
                    onAddUser={handleAddAndMove}
                    expanded={expandedTitle === item.page}
                    onToggle={() => onToggle(item.page)}
                    setCurrentPage={setCurrentPage}
                  />
                ))
              ) : (
                <Text style={{ padding: 20, textAlign: 'center' }}>No users found</Text>
              )}
            </ScrollView>
          ) : (
            <>
              <Text style={{ fontSize: 16, marginBottom: 10 }}>Suggested:</Text>
              <ScrollView
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingBottom: 500 }}
                showsVerticalScrollIndicator={false}
              >
                {suggestions.map((item) => (
                  <ExpandableGroup
                    key={item.page}
                    item={item}
                    onAddUser={handleAddAndMove}
                    expanded={expandedTitle === item.page}
                    onToggle={() => onToggle(item.page)}
                    setCurrentPage={setCurrentPage}
                  />
                ))}
              </ScrollView>
            </>
          )}

        </View>
      )}

      {currentPage === 'help' && (
        <View style={{ flex: 1, padding: 20 }}>
          {/* Help Icon and Title */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              marginBottom: 30,
            }}>
            <Ionicons name="information-circle" size={80} color="#2772BC" />
            <View style={{ marginLeft: 15 }}>
              <Text style={{ fontSize: 22, fontWeight: 'bold' }}>Help</Text>
              <Text style={{ fontSize: 14, color: '#555' }}>
                How to use the app effectively
              </Text>
            </View>
          </View>

          <View style={{ height: 500, zIndex: 0 }}>
            {/* Scrollable Help Sections */}
            <ScrollView showsVerticalScrollIndicator={false}>
              <View
                style={{
                  height: 100,
                  backgroundColor: '#DB4A2B',
                  borderRadius: 10,
                  marginBottom: 15,
                  padding: 15,
                  justifyContent: 'center',
                }}>
                <Text
                  style={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>
                  Tasks
                </Text>
                <Text style={{ color: 'white', marginTop: 5 }}>
                  Create tasks on the main screen. Tap to add details or
                  subtasks.
                </Text>
              </View>

              <View
                style={{
                  height: 100,
                  backgroundColor: '#2772BC',
                  borderRadius: 10,
                  padding: 15,
                  justifyContent: 'center',
                }}>
                <Text
                  style={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>
                  Navigation
                </Text>
                <Text style={{ color: 'white', marginTop: 5 }}>
                  Use the menu to switch pages. Archived tasks are under
                  "Archived".
                </Text>
              </View>
            </ScrollView>
          </View>
        </View>
      )}

      {items.map((item) => (
        <PageWithBack
          key={item.page}
          mlUser={mlUser}
          currentPage={currentPage}
          pageName={item.page}
          setCurrentPage={setCurrentPage}
          title={item.name}
          bio={item.bio}      // 👈 this comes straight from your items var
          type={item.type} 
          icon={
            item.useMaterial ? (
              <MaterialCommunityIcons name={item.icon} size={24} color="grey" />
            ) : (
              <Ionicons name={item.icon} size={24} color="grey" />
            )
          }
        />
      ))}

      {currentPage === 'archived' && (
        <>
          <View
            style={{ flexDirection: 'row', alignItems: 'center', padding: 16 }}>
            <TouchableOpacity onPress={() => setCurrentPage('people')}>
              <Ionicons name="arrow-back" size={24} color="black" />
            </TouchableOpacity>
            <Text style={{ fontSize: 20, fontWeight: 'bold', marginLeft: 10 }}>
              Archived
            </Text>
          </View>

          <ScrollView contentContainerStyle={styles.boxscroll}>
            <GroupPeople
              setCurrentPage={setCurrentPage}
              archived={true}
              items={[...archivedGroups, ...archivedPeople]} // ✅ merged archived items
              setItems={setItems}
            />
          </ScrollView>
        </>
      )}

      <ScrollView
        style={styles.taskList}
        contentContainerStyle={{ paddingBottom: 120 }}>
        {currentPage === 'target' && (
          <View>
            {goals.length === 0 ? (
              <Text style={{ textAlign: 'center', marginTop: 20 }}>
                There are no goals.{"\n"}
                Add goals by clicking the {""}
                <Ionicons name="add-circle-outline" size={18} color="black" /> icon in the top right
              </Text>
            ) : (
              goals.map((goal, index) => (
              <ExpandableBlock
                key={index}
                goalTitle={goal.title}
                streakNumber={goal.streakNumber}
                Currentstreak={goal.Currentstreak}
                longeststreak={goal.longeststreak}
                consistency={goal.consistency}
                weekStreak={goal.weekStreak}           // ✅ add
                weekConsistency={goal.weekConsistency}
                workoutCompleted={goal.workoutCompleted}
                expanded={expandedGoalIndex === index}
                onPress={() => handleGoalPress(index)}
                daysPerWeek={goal.daysPerWeek}
                onEditGoalPage={() => handleEditGoal(index)}
                goalDates={goal.dates} 
                onDeleteGoal={() => {
                  setGoals(prevGoals => prevGoals.filter((_, idx) => idx !== index));
                }}       // <-- use dates from goal
                setGoalDates={(newDates) => {
                  const updatedGoals = [...goals];
                  updatedGoals[index].dates = newDates;
                  setGoals(updatedGoals);
                }}
              />
              ))
            )}
          </View>
        )}

        {currentPage === 'addGoal' && (
          <View style={styles.taskDetailPageContainer}>
            <Text style={{ fontSize: 25, fontWeight: 'bold', marginBottom: 10 }}>
              Add New Goal
            </Text>

            <TextInput
              value={newGoalTitle}
              onChangeText={setNewGoalTitle}
              placeholder="Goal title"
              style={[styles.modalTitle, { marginBottom: 10, color: "grey"}]}
              placeholderTextColor="lightgrey"
            />

            <TextInput
              value={newGoalDays}
              onChangeText={setNewGoalDays}
              placeholder="Days per week"
              keyboardType="numeric"
              style={[styles.modalTitle, { marginBottom: 20, color: "grey" }]}
              placeholderTextColor="lightgrey"
            />

            <TouchableOpacity
              onPress={() => {

                if (newGoalTitle.trim() === '' || newGoalDays.trim() === '') {
                  alert('Invalid, Please fill in both fields');
                  return; // stop execution
                }

                setNewGoalTitle('');
                setNewGoalDays('');
                
                setCurrentPage('target');

                const newGoal = {
                title: newGoalTitle,
                daysPerWeek: parseInt(newGoalDays),
                streakNumber: 0,
                Currentstreak: '0',
                longeststreak: '0 days',
                consistency: '0%',
                weekStreak: 0,           // ✅ add
                weekConsistency: '0%', 
                workoutCompleted: false,
                dates: [],  // each goal starts with its own empty array
              };
              setGoals([...goals, newGoal]);


                // Add empty array for new goal in goalDates
                //</View>setGoalDates(prev => ({
                //  ...prev,
                //  [newGoalTitle]: [],
                //}));

                


                
              }}

              style={{ alignSelf: 'center' }}
              >
                <Text style={{ color: '#2772BC', fontWeight: 'bold' }}>Add Goal</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  setNewGoalTitle('');
                  setNewGoalDays('');
                  setCurrentPage('target');
                }}
                style={{ marginTop: 15, alignSelf: 'center' }}
              >
                <Text style={{ color: 'grey' }}>Cancel</Text>
              </TouchableOpacity>
          </View>
        )}

        {currentPage === 'editGoal' && (
          <View style={styles.taskDetailPageContainer}>
            <Text style={{ fontSize: 25, fontWeight: 'bold', marginBottom: 10 }}>
              Edit Goal
            </Text>

            <TextInput
              value={editGoalTitle}
              onChangeText={setEditGoalTitle}
              placeholder="Goal title"
              style={[styles.modalTitle, { marginBottom: 10, color: "grey"}]}
              placeholderTextColor="lightgrey"
            />

            <TextInput
              value={editGoalDays}
              onChangeText={setEditGoalDays}
              placeholder="Days per week"
              keyboardType="numeric"
              style={[styles.modalTitle, { marginBottom: 20, color: "grey"}]}
              placeholderTextColor="lightgrey"
            />

            <TouchableOpacity
              onPress={() => {
                if (!editGoalTitle.trim() || !editGoalDays.trim()) {
                  alert('Please fill in both fields');
                  return;
                }

                // Update goal in parent state
                setGoals(prevGoals => {
                  const updated = [...prevGoals];
                  updated[editGoalIndex] = {
                    ...updated[editGoalIndex],
                    title: editGoalTitle,
                    daysPerWeek: parseInt(editGoalDays),
                  };
                  return updated;
                });

                setCurrentPage('target');
                setEditGoalIndex(null);
                setEditGoalTitle('');
                setEditGoalDays('');
                
                // Update all goal stats immediately
                setGoals(prevGoals =>
                  prevGoals.map(goal => {
                    const weekDone = countThisWeek(goal.dates); // current week progress
                    const {
                      currentStreak,
                      longestStreak,
                      consistency,
                      weekStreak,
                      longestWeekStreak,
                      weekConsistency
                    } = calculateStreaks(goal.dates, goal.daysPerWeek);

                    return {
                      ...goal,
                      streakNumber: currentStreak,
                      Currentstreak: `${currentStreak}`,
                      longeststreak: `${longestStreak} days`,
                      consistency,
                      weekStreak,
                      longestWeekStreak,
                      weekConsistency,
                      workoutCompleted: weekDone > 0,
                    };
                  }) // <-- close map here
                );   // <-- close setGoals here
                
              }}
              style={{ alignSelf: 'center' }}
            >
              <Text style={{ color: '#2772BC', fontWeight: 'bold' }}>Save</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                setCurrentPage('target');
                setEditGoalIndex(null);
                setEditGoalTitle('');
                setEditGoalDays('');

                // Update all goal stats immediately
                setGoals(prevGoals =>
                  prevGoals.map(goal => {
                    const weekDone = countThisWeek(goal.dates); // current week progress
                    const {
                      currentStreak,
                      longestStreak,
                      consistency,
                      weekStreak,
                      longestWeekStreak,
                      weekConsistency
                    } = calculateStreaks(goal.dates, goal.daysPerWeek);

                    return {
                      ...goal,
                      streakNumber: currentStreak,
                      Currentstreak: `${currentStreak}`,
                      longeststreak: `${longestStreak} days`,
                      consistency,
                      weekStreak,
                      longestWeekStreak,
                      weekConsistency,
                      workoutCompleted: weekDone > 0,
                    };
                  }) // <-- close map here
                );   // <-- close setGoals here
              }}
              style={{ marginTop: 15, alignSelf: 'center' }}
            >
              <Text style={{ color: 'grey' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}


        {currentPage === 'people' && (
          <>
            <ArchivedBar setCurrentPage={setCurrentPage} />
            <GroupPeople
              setCurrentPage={setCurrentPage}
              items={items}
              setItems={setItems}
            />
          </>
        )}

        


        <Pressable
          style={{ flex: 1 }}
          onPress={() => {
            Keyboard.dismiss(); // Hide keyboard first
            if (newTaskText.trim() === '') {
              setIsAddingTask(false);
              setFilteredSuggestions([]);
            } else {
              handleAddTask();
              setIsAddingTask(false);
              setNewTaskText('');
              setFilteredSuggestions([]);
            }
          }}>
          {currentPage === 'home' && (
            <>
              {isAddingTask && (
                <View style={styles.taskInputWrapper}>
                  <View style={styles.squareBox} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <TextInput
                      placeholder="Type your task"
                      value={newTaskText}
                      onChangeText={(text) => {
                        setNewTaskText(text);
                        if (text.length === 0) {
                          setFilteredSuggestions(goals.map((g) => `Goal - ${g.title}`));
                        } else {
                          const filtered = goals
                            .map((g) => `Goal - ${g.title}`)
                            .filter((item) =>
                              item.toLowerCase().startsWith(text.toLowerCase())
                            );
                          setFilteredSuggestions(filtered);
                        }
                      }}
                      onBlur={() => {
                        setTimeout(() => {
                          if (filteredSuggestions.length === 0) {
                            if (newTaskText.trim()) {
                              handleAddTask();
                            }
                            setIsAddingTask(false);
                            setNewTaskText('');
                            setFilteredSuggestions([]);
                          }
                        }, 100); // delay so suggestion tap registers first
                      }}
                      style={styles.underlineInput}
                    />


                    {filteredSuggestions.length > 0 && (
                      <View
                        style={{
                          maxHeight: 120,
                          marginTop: 5,
                          zIndex: 999,
                          elevation: 10,
                        }}
                      >
                        {filteredSuggestions.map((item) => (
                          <Pressable
                            key={item}
                            onPress={(e) => {
                              e.stopPropagation(); // Prevent outer Pressable onPress
                              handleAddSuggestionTask(item);
                            }}
                            style={{
                              padding: 8,
                              backgroundColor: '#eee',
                              marginBottom: 2,
                              borderRadius: 5,
                            }}
                          >
                            <Text>{item}</Text>
                          </Pressable>
                        ))}
                      </View>
                    )}

                  </View>
                </View>
              )}

              {/* Active Tasks */}
              {tasks.map((task, i) => (
                <TaskItem
                  key={i}
                  text={task.text}
                  checked={false}
                  onToggle={() => toggleCheckTask(i)}
                  onDelete={() => {
                    const updated = [...tasks];
                    updated.splice(i, 1);
                    setTasks(updated);
                  }}
                  subtitle={task.desc}
                  subtasks={task.subtasks}
                  onToggleSubtask={(subIdx) => updateSubtaskChecked(i, subIdx)}
                  onDeleteSubtask={(subIdx) => deleteSubtask(i, subIdx)}
                  onPress={() => {
                    setSelectedTask(i);
                    setEditedText(task.text);
                    setEditedDesc(task.desc);
                    setCurrentPage('editTask');
                    setIsAddingTask(false);
                  }}
                  onPressSubtask={(subIdx) => {
                    setSelectedSubtask({ taskIdx: i, subIdx });
                    setEditedSubtaskText(task.subtasks[subIdx].text);
                    setEditedSubtaskDesc(task.subtasks[subIdx].desc || '');
                    setSubtaskFromTaskModal(false);
                    setCurrentPage('editSubtask');
                    setIsAddingTask(false);
                  }}
                />
              ))}

              {/* Done Tasks Toggle */}
              <TouchableOpacity
                onPress={() => {
                  setDoneCollapsed(!doneCollapsed);
                  setIsAddingTask(false);
                }}
                style={{
                  padding: 10,
                  backgroundColor: 'white',
                  marginTop: 20,
                  marginHorizontal: 25,
                  borderRadius: 10,
                  justifyContent: 'center',
                  alignItems: 'center',
                }}>
                <Text style={{ fontWeight: 'bold' }}>
                  Done Tasks {doneCollapsed ? '▼' : '▲'}
                </Text>
              </TouchableOpacity>

              {/* Done Tasks List */}
              {!doneCollapsed &&
                doneTasks.map((task, i) => (
                  <TaskItem
                    key={i}
                    text={task.text}
                    checked={true}
                    onToggle={() => toggleUncheckDoneTask(i)}
                    onDelete={() => {
                      const updated = [...doneTasks];
                      updated.splice(i, 1);
                      setDoneTasks(updated);
                    }}
                    subtitle={task.desc}
                    subtasks={task.subtasks}
                    onToggleSubtask={() => {}}
                    onDeleteSubtask={() => {}}
                    onPress={() => {}}
                    onPressSubtask={() => {}}
                  />
                ))}
            </>
          )}
        </Pressable>

        {currentPage === 'profile' && (
          <View style={{}}>
            {/* Profile Icon, Name, and Bio */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginBottom: 30,
              }}>
              {/* Profile Icon */}
              <Ionicons name="person-circle" size={100} color="grey" />

              {/* Name and Bio */}
              <View style={{ marginLeft: 15 }}>
                <TextInput
                  style={{
                    fontSize: 20,
                    fontWeight: 'bold',
                    borderBottomWidth: 1,
                    height: 20, 
                    borderBottomColor: '#ccc',
                    paddingVertical: 2,
                    width: 130,      
                  }}
                  placeholder="Your Name"
                  value={userName}           // state variable for name
                  onChangeText={text => setUserName(text)}
                />
                <TextInput
                  style={{
                    fontSize: 14,
                    borderBottomWidth: 0,
                    borderBottomColor: '#ccc',
                    paddingVertical: 2,
                  }}
                  placeholder="Your Bio"
                  value={userBio}
                  onChangeText={text => setUserBio(text)}
                />
              </View>
            </View>

            {/* Empty Bars, <Profile/> */}
            <View
              style={{
                height: 50,
                backgroundColor: '#eee',
                borderRadius: 10,
                marginBottom: 10,
                justifyContent: 'center',
                paddingLeft: 10,
              }}
            >
            </View>

            <View
              style={{
                height: 50,
                backgroundColor: '#eee',
                borderRadius: 10,
                justifyContent: 'center',
                paddingLeft: 10,
              }}
            >
            </View>
          </View>
        )}

        {/* Task Modal */}
        {currentPage === 'editTask' && selectedTask !== null && (
          <View style={styles.taskDetailPageContainer}>
            {/* Header */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 20,
              }}>
              {/* Back button */}
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TouchableOpacity
                  onPress={() => {
                    const updated = [...tasks];
                    updated[selectedTask].text = editedText;
                    updated[selectedTask].desc = editedDesc;
                    setSelectedTask(null);
                    setCurrentPage('home');
                    setShowAddSubtask(false);
                  }}>
                  <Ionicons name="arrow-back" size={24} color="black" />
                </TouchableOpacity>
                <Text style={{ fontSize: 18, marginLeft: 10 }}>go back</Text>
              </View>

              {/* Dropdown */}
              <TouchableOpacity onPress={() => setShowDropdown(!showDropdown)}>
                <Ionicons name="ellipsis-horizontal" size={24} color="grey" />
              </TouchableOpacity>
            </View>
            {/* Task Title & Desc */}
            <TextInput
              value={editedText}
              onChangeText={setEditedText}
              style={styles.modalTitle}
            />
            <TextInput
              value={editedDesc}
              onChangeText={setEditedDesc}
              style={styles.modalDesc}
              multiline
              placeholder="Press to edit Description..."
              placeholderTextColor="grey"
            />
            {/* Subtasks */}
            <View style={{ marginVertical: 10 }}>
              {showAddSubtask && (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    marginBottom: 6, // same as other subtasks
                  }}
                >
                  {/* Checkbox placeholder */}
                  <TouchableOpacity
                    style={styles.subtaskBox}
                    disabled
                  >
                    {/* empty, no checkmark yet */}
                  </TouchableOpacity>

                  {/* Input for new subtask */}
                  <TextInput
                    ref={inputRef}
                    placeholder="Type your subtask"
                    placeholderTextColor='grey'
                    value={newSubtask}
                    onChangeText={setNewSubtask}
                    style={[
                      styles.subtitleText2, // same style as collapsed subtasks
                      { flex: 1, marginLeft: 10, paddingVertical: 0,  },
                    ]}
                    autoFocus
                    onSubmitEditing={() => {
                      if (newSubtask.trim()) {
                        const updated = [...tasks];
                        updated[selectedTask].subtasks.unshift({ // <- use unshift
                          text: newSubtask,
                          desc: '',
                          checked: false,
                        });
                        setTasks(updated);
                        setNewSubtask('');
                        setShowAddSubtask(false);
                      }
                    }}
                    onBlur={() => {
                      if (newSubtask.trim()) {
                        const updated = [...tasks];
                        updated[selectedTask].subtasks.unshift({ // <- use unshift
                          text: newSubtask,
                          desc: '',
                          checked: false,
                        });
                        setTasks(updated);
                        setNewSubtask('');
                      }
                      setShowAddSubtask(false);
                    }}
                  />
                </View>
              )}
              {tasks[selectedTask]?.subtasks?.map((sub, idx) => (
                <View key={idx}>
                  {selectedSubtask?.subIdx === idx ? (
                    // Compact Inline Editor
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        marginBottom: 6,
                      }}>
                      <TouchableOpacity
                        onPress={() => updateSubtaskChecked(selectedTask, idx)}
                        style={styles.subtaskBox}>
                        {sub.checked && (
                          <Ionicons name="checkmark" size={14} color="grey" />
                        )}
                      </TouchableOpacity>

                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <TextInput
                          value={editedSubtaskText}
                          onChangeText={setEditedSubtaskText}
                          style={[
                            styles.subtitleText,
                            { padding: 0, margin: 0 },
                          ]}
                          autoFocus
                        />
                        <TextInput
                          value={editedSubtaskDesc}
                          onChangeText={setEditedSubtaskDesc}
                          style={{
                            fontSize: 16,
                            color: 'black',
                            padding: 0,
                            margin: 0,
                          }}
                          placeholder="Description..."
                          placeholderTextColor="grey"
                          multiline
                        />
                      </View>

                      <TouchableOpacity
                        onPress={() => deleteSubtask(selectedTask, idx)}>
                        <Ionicons name="trash" size={20} color="grey" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    // Collapsed Subtask View
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        marginBottom: 6,
                      }}>
                      <TouchableOpacity
                        onPress={() => updateSubtaskChecked(selectedTask, idx)}
                        style={styles.subtaskBox}>
                        {sub.checked && (
                          <Ionicons name="checkmark" size={14} color="grey" />
                        )}
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => {
                          if (selectedSubtask) saveSubtaskInline();
                          setSelectedSubtask({
                            taskIdx: selectedTask,
                            subIdx: idx,
                          });
                          setEditedSubtaskText(sub.text);
                          setEditedSubtaskDesc(sub.desc || '');
                          setSubtaskFromTaskModal(true); // track that we came from editTask
                          setCurrentPage('editSubtask'); // open subtask view
                        }}
                        style={{ flex: 1 }}>
                        <View style={{ marginLeft: 10 }}>
                          <Text
                            style={[
                              styles.subtitleText2,
                              sub.checked && styles.strikedText,
                            ]}>
                            {sub.text}
                          </Text>
                          {sub.desc ? (
                            <Text numberOfLines={1}
                                ellipsizeMode="tail" style={{ fontSize: 12, color: 'grey', maxWidth: '60%' }}>
                              {sub.desc}
                            </Text>
                          ) : null}
                        </View>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ))}
            </View>
            {/* Click-away to save inline subtask edit */}
            {selectedSubtask && !showDropdown && (
              <TouchableOpacity
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  zIndex: 1, // ABOVE normal content, BELOW dropdown
                }}
                activeOpacity={1}
                onPress={() => saveSubtaskInline()}
              />
            )}

            {showDropdown && (
              <>
                <TouchableOpacity
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 3,
                  }}
                  activeOpacity={1}
                  onPress={() => setShowDropdown(false)}
                />
                <View style={[styles.dropdownStyle, { zIndex: 4 }]}>
                  <TouchableOpacity
                    onPress={() => {
                      handleDelete(selectedTask);
                      setShowDropdown(false);
                    }}
                    style={{ padding: 10 }}>
                    <Text style={{ color: 'red' }}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            
          </View>
        )}

        {/* Subtask Modal */}
        {currentPage === 'editSubtask' && selectedSubtask !== null && (
          <View style={styles.subtaskPageContainer}>
            {/* Header */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 20,
              }}>
              {/* Back button */}
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TouchableOpacity
                  onPress={() => {
                    const updated = [...tasks];
                    const { taskIdx, subIdx } = selectedSubtask;
                    updated[taskIdx].subtasks[subIdx].text = editedSubtaskText;
                    updated[taskIdx].subtasks[subIdx].desc = editedSubtaskDesc;
                    setTasks(updated);
                    setSelectedSubtask(null);

                    if (subtaskFromTaskModal) {
                      setSelectedTask(taskIdx); // go back to task page
                      setCurrentPage('editTask');
                    } else {
                      setCurrentPage('home'); // go back home
                    }
                  }}>
                  <Ionicons name="arrow-back" size={24} color="black" />
                </TouchableOpacity>
                <Text style={{ fontSize: 18, marginLeft: 10 }}>go back</Text>
              </View>

              {/* Dropdown */}
              <TouchableOpacity
                onPress={() => setShowSubtaskDropdown(!showSubtaskDropdown)}>
                <Ionicons name="ellipsis-horizontal" size={24} color="grey" />
              </TouchableOpacity>
            </View>

            {showSubtaskDropdown && (
              <>
                <TouchableOpacity
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 999,
                  }}
                  activeOpacity={1}
                  onPress={() => setShowSubtaskDropdown(false)}
                />
                <View style={styles.dropdownStyle}>
                  <TouchableOpacity
                    onPress={() => {
                      const { taskIdx, subIdx } = selectedSubtask;
                      const updated = [...tasks];
                      updated[taskIdx].subtasks.splice(subIdx, 1); // delete subtask
                      setTasks(updated);
                      setSelectedSubtask(null);
                      setShowSubtaskDropdown(false);

                      if (subtaskFromTaskModal) {
                        setSelectedTask(taskIdx);
                        setCurrentPage('editTask');
                      } else {
                        setCurrentPage('home');
                      }
                    }}
                    style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{ padding: 10, color: 'red' }}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            <TextInput
              value={editedSubtaskText}
              onChangeText={setEditedSubtaskText}
              style={styles.modalTitle}
            />

            <TextInput
              value={editedSubtaskDesc}
              onChangeText={setEditedSubtaskDesc}
              style={styles.modalDesc}
              multiline
              placeholder="Press to edit description..."
              placeholderTextColor="grey"
            />
          </View>
        )}
      </ScrollView>

      <View style={styles.middleIcons}>
        <TouchableOpacity onPress={() => setCurrentPage('home')}>
          <Ionicons
            name="checkmark-circle"
            size={60}
            color={
              ['home', 'editTask', 'editSubtask', 'addTask'].includes(
                currentPage
              )
                ? '#2772BC'
                : 'grey'
            }
          />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setCurrentPage('people')}>
          <Ionicons
            name="people-circle"
            size={60}
            color={peoplePages.includes(currentPage) ? '#2772BC' : 'grey'}
          />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            setCurrentPage('target');

            // Update all goal stats immediately
            setGoals(prevGoals =>
              prevGoals.map(goal => {
                const weekDone = countThisWeek(goal.dates); // current week progress
                const {
                  currentStreak,
                  longestStreak,
                  consistency,
                  weekStreak,
                  longestWeekStreak,
                  weekConsistency
                } = calculateStreaks(goal.dates, goal.daysPerWeek);

                return {
                  ...goal,
                  streakNumber: currentStreak,
                  Currentstreak: `${currentStreak}`,
                  longeststreak: `${longestStreak} days`,
                  consistency,
                  weekStreak,
                  longestWeekStreak,
                  weekConsistency,
                  workoutCompleted: weekDone > 0,
                };
              })
            );
          }}
        >
          <MaterialCommunityIcons
            name="target"
            size={60}
            color={
              currentPage === 'target' || currentPage === 'addGoal'
                ? '#2772BC'
                : 'grey'
            }
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
    paddingHorizontal: 20,
    paddingTop: 30,
    zIndex: -10,
  },
  taskInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 10,
  },
  underlineInput: {
    borderBottomWidth: 1,
    borderBottomColor: 'grey',
    fontSize: 16,
    paddingVertical: 4,
  },

  line: {
    width: '100%',
    height: 2,
    backgroundColor: 'lightgrey',
    alignSelf: 'center',
    top: 75,
  },

  contentWrapper: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 5,
    paddingTop: 10,
  },

  archiveBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10, // or '80%' for relative sizing
    height: 50, // adjust as needed
    borderColor: 'grey',
    borderRadius: 10,
    backgroundColor: '#f2f2f2',
  },

  archiveText: {
    fontSize: 16,
    marginLeft: 10,
    color: 'grey',
  },

  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2000,
  },
  modalContainer: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 8,
    width: '80%',
    maxWidth: 300,
    alignItems: 'center',
  },
  modalButton: {
    flex: 1,
    padding: 10,
    marginHorizontal: 5,
    borderRadius: 5,
    alignItems: 'center',
  },

  textbox1: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    padding: 10, // or '80%' for relative sizing
    height: 55, // adjust as needed
    borderColor: 'grey',
    borderRadius: 10,
    backgroundColor: '#BEBEBE',
    position: 'relative',
  },
  box1text: {
    fontSize: 16,
    marginLeft: 10,
    color: 'black',
    position: 'relative',
  },

  dashedLine: {
    height: 1,
    width: '100%',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'grey',
    borderStyle: 'dashed',
    marginTop: 10,
  },

  taskList: {
    marginTop: 20,
    fontWeight: 'bold',
    marginHorizontal: 20,
    maxHeight: '90%',
  },

  boxscroll: {
    marginHorizontal: 20,
    maxHeight: '90%',
  },

  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  squareBox: {
    width: 25,
    height: 25,
    borderWidth: 2,
    borderColor: 'grey',
    justifyContent: 'center',
    alignItems: 'center',
  },
  taskText: { fontSize: 18, color: 'black' },
  strikedText: { textDecorationLine: 'line-through', color: 'grey' },
  subtitleText: { fontSize: 14, marginTop: 2, color: 'grey' },
  subtitleText2: { fontSize: 14, marginTop: 2, color: 'black' },

  middleIcons: {
    position: 'absolute',
    bottom: 20,
    left: '15%',
    right: '15%',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'lightgrey',
    paddingVertical: 5,
    paddingHorizontal: 50,
    borderRadius: 20,
    gap: 30,
    zIndex: 10000,
    elevation: 10000,
    shadowColor: 'rgba(0,0,0,0.5)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  modalTitle: {
    fontSize: 32,
    borderBottomWidth: 0,
    borderBottomColor: '#ccc',
    paddingTop: 6,
    marginBottom: 1,
    fontWeight: 'bold',
  },
  modalDesc: {
    fontSize: 18,
    borderWidth: 0,
    borderColor: '#ccc',
    paddingBottom: 0,
    borderRadius: 6,
    minHeight: 25,
    textAlignVertical: 'top',
  },

  taskDetailPageContainer: {
    backgroundColor: '#fff',
    justifyContent: 'flex-start', // add this
  },
  subtaskPageContainer: {
    backgroundColor: '#fff',
    justifyContent: 'flex-start', // add this
  },
  subtaskBox: {
    height: 20,
    width: 20,
    borderRadius: 3,
    borderColor: 'grey',
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtaskText: { fontSize: 16 },

  dropdown: {
    position: 'absolute',
    top: 25,
    right: 0,
    backgroundColor: '#fff',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 5,
    elevation: 100,
    zIndex: 999,
  },
  item: {
    paddingVertical: 10,
    paddingHorizontal: 15,
  },
  text: {
    fontSize: 16,
  },

  dropdownStyle: {
    position: 'absolute',
    top: 20, // right below the button
    right: 0, // aligned to the right edge
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 5,
    paddingVertical: 2,
    paddingHorizontal: 12,
    zIndex: 1000,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    alignItems: 'flex-start', // left align text inside dropdown
  },
});
