FreeShow


Features


Resources


Docs



Downloads

API Docs
Actions
5505
http://localhost:5505

The first value is the action ID. (Example: "name_run_action")
The value in the black box is the data you can pass with the action, in JSON format. (Example: {"value?": boolean | string} can be {"value": true})
? means that the value is optional, | means OR, and any is not specified here
PROJECT
id_select_project

						{"id": string}
					
index_select_project

						{"index": number}
					
name_select_project

						{"value": string}
					


next_project_item


previous_project_item
index_select_project_item

						{"index": number}
					
SHOWS
name_select_show

						{"value": string}
					
start_show

						{"id": string}
					
change_layout

						{"showId": string, "layoutId": string}
					
set_plain_text

						{"id": string, "value": string}
					
set_show

						{"id": string, "value": string}
					
rearrange_groups

						{"showId": string, "from": number, "to": number}
					
add_group

						{"showId": string, "groupId": string}
					
set_template

						{"id": string}
					
transpose_show_up

						{"id": string}
					
transpose_show_down

						{"id": string}
					
PRESENTATION


next_slide


previous_slide


random_slide
index_select_slide

						{"showId?": string, "layoutId?": string, "index": number}
					
name_select_slide

						{"value": string}
					
id_select_group

						{"id": string}
					


start_slide_recording
CLEAR


restore_output


clear_all


clear_background


clear_slide


clear_overlays
clear_overlay

						{"id": string}
					


clear_audio


clear_next_timer


clear_drawing
MEDIA
start_camera



						{"name?": string, "id": string, "groupId?": string}
					
start_screen

						{"name?": string, "id": string}
					
play_media

						{"path": string, "index?": number, "data?": any}
					


toggle_playing_media
video_seekto

						{"id?": string, "seconds": number}
					
id_start_effect

						{"id": string}
					
OVERLAYS
index_select_overlay

						{"index": number}
					
name_select_overlay

						{"value": string}
					
id_select_overlay

						{"id": string}
					
start_scripture

						{"id?": string, "reference": string}
					


scripture_next


scripture_previous
lock_output

						{"value?": boolean, "outputId?": string}
					


toggle_output_windows
toggle_output

						{"id": string}
					
VISUAL
id_select_output_style

						{"id": string}
					
change_output_style

						{"outputId?": string, "styleId?": string}
					
change_stage_output_layout

						{"outputId?": string, "stageLayoutId": string}
					
change_transition

						{"id?": "text" | "media", "type?": TransitionType, "duration?": number, "easing?": string}
					
STAGE
id_select_stage_layout

						{"id": string}
					
play_audio

						{"path": string, "index?": number, "data?": any}
					
pause_audio

						{"path": string, "index?": number, "data?": any}
					
stop_audio

						{"path": string, "index?": number, "data?": any}
					
audio_seekto

						{"id?": string, "seconds": number}
					
AUDIO
change_volume

						{"volume?": number}
					
start_audio_stream

						{"id": string}
					
start_playlist

						{"id": string}
					
name_start_playlist

						{"value": string}
					


playlist_next
start_metronome

						{"metadataBPM?": boolean, "tempo?": number, "beats?": number, "volume?": number, "audioOutput?": string}
					
start_audio_effect

						{"path": string, "index?": number, "data?": any}
					
TIMERS
name_start_timer

						{"value": string}
					
id_start_timer

						{"id": string}
					
start_slide_timers

						{"showId?": string | "active", "slideId?": string}
					


pause_timers


stop_timers
timer_seekto

						{"id?": string, "seconds": number}
					
edit_timer

						{"id": string, "key": string, "value": any}
					
id_pause_timer

						{"id": string}
					
name_pause_timer

						{"value": string}
					
id_stop_timer

						{"id": string}
					
name_stop_timer

						{"value": string}
					
FUNCTIONS
change_variable

						{"id?": string, "name?": string, "index?": number, "key?": "text" | "number" | "random_number" | "text_set" | "value" | "enabled" | "step" | "name" | "type" | "increment" | "decrement" | "expression" | "randomize" | "reset" | "next" | "previous", "value?": string | number | boolean, "variableAction?": "increment" | "decrement"}
					
start_trigger

						{"id": string}
					
change_draw_zoom

						{"size?": number, "x?": number, "y?": number}
					


sync_drive
OTHER


sync_content_provider
send_rest_command

						{"url": string, "method": string, "contentType": string, "payload": string}
					
emit_action

						{"emitter": string, "template?": string, "templateValues?": { name:  string, "value": string | { note?:  number, "velocity?": number, "channel?": number}
					
toggle_log_song_usage

						{"value?": boolean}
					
ACTION
name_run_action

						{"value": string}
					
run_action

						{"id": string}
					
toggle_action

						{"id": string, "value?": boolean}
					
EDIT
add_to_project

						{"projectId": string, "id": string, "data?": any}
					
create_show

						{"text": string, "name?": string, "category?": string}
					
create_project

						{"name": string, "id?": string}
					
delete_project

						{"id": string}
					
remove_project_item

						{"id": string, "index": number}
					
rename_project

						{"id": string, "name": string}
					
GET
get_shows
get_show

						{"id": string}
					
get_show_layout

						{"id": string}
					
get_projects
get_project

						{"id": string}
					
get_plain_text

						{"id": string}
					
get_groups

						{"id": string}
					
get_output

						{"id?": string}
					
get_output_slide_text
get_output_group_name
get_dynamic_value

						{"value": string, "ref?": any}
					
get_playing_video_duration
get_playing_video_time
get_playing_video_time_left
get_playing_audio_duration
get_playing_audio_time
get_playing_audio_time_left
get_playing_audio_data
get_variables
get_variable
get_timers
get_playlists
get_playlist

						{"id?": string}
					
get_slide

						{"showId?": string | "active", "slideId?": string}
					
get_thumbnail

						{"path": string, "index?": number, "data?": any}
					
get_slide_thumbnail

						{"showId?": string, "layoutId?": string, "index?": number}
					
get_pdf_thumbnails

						{"path": string, "index?": number, "data?": any}
					
get_cleared
Examples
Make sure the WebSocket/REST API is active in the FreeShow "Connections" settings!

HTTP

    fetch(`http://localhost:5506?action=${ACTION_ID}&data=${JSON.stringify(data)}`)
	
REST
Note: Must be a POST request.


    fetch("http://localhost:5506", { method: "POST", body: JSON.stringify({ action: ACTION_ID, ...data }) })
	
WebSocket

    let socket = io.connect("http://localhost:5505", { transports: ["websocket"] })
    socket.emit("data", JSON.stringify({ action: ACTION_ID, ...data }))
    
For Node.js, check out the NPM Helper Package.




Report a bug or request a feature ● Donate ● dev@freeshow.app

2026 © Live Church Solutions - A 501(c)(3) organization with EIN 45-5349618
⚛️React Not Detected
React is not detected on this page.
Please ensure you're visiting a React application.
