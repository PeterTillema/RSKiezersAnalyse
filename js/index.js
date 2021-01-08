let $ = window.jQuery;
let alvs = [];
let voting_options = [
	{'type': 'Geen stemming'},
	{'type': 'Regulier', 'quorum': 0.25, 'votes_true': 0.501, 'votes_amount': 0}, // This should be 0.5, but this should be an absolute majority, so a little bit more than 0.5
	{'type': 'HR-wijziging', 'quorum': 0.25, 'votes_true': 0.666, 'votes_amount': 0.666},
	{'type': 'Statutenwijziging', 'quorum': 0.25, 'votes_true': 0.75, 'votes_amount': 0.75},
	{'type': 'HR-wijziging (opnieuw)', 'quorum': 0.25, 'votes_true': 0.6667, 'votes_amount': 0},
	{'type': 'Statutenwijziging (opnieuw)', 'quorum': 0.25, 'votes_true': 0.75, 'votes_amount': 0}
];
let template;

window.onbeforeunload = function(){
	return 'Weet je zeker dat je wilt stoppen??';
};

$(document).ready(function () {
	let alv_import = $('#alv-import');
	let auth_form = $('#auth_form');
	let agenda_form = $('#agenda_item_form');
	let alv_form = $('#alv_form');
	let vote_form = $('#vote_form');

	// Handle ALV import
	alv_import.on('change', function (e) {
		let files = alv_import.prop('files');

		if (files) {
			let fileReader = new FileReader();
			fileReader.onload = function () {
				let data = fileReader.result;
				alvs = $.parseJSON(data);
				render_template();
			}
			fileReader.readAsText(files[0]);
		}
	});

	auth_form.on('submit', (e) => {
		e.preventDefault();

		let authorizing_member = parseInt($('#auth_authorizing_member').find('option:selected').val());
		let authorized_member = parseInt($('#auth_authorized_member').find('option:selected').val())
		let alv_id = parseInt($('#auth_modal_alv_id').val());

		if (authorizing_member === authorized_member) {
			$.notify('Iemand kan niet zichzelf machtigen', 'error');
			return;
		}

		if (alvs[alv_id].auths.hasOwnProperty(authorizing_member)) {
			$.notify('Iemand kan maar 1 persoon machtigen', 'error');
			return;
		}

		if (Object.values(alvs[alv_id].auths).includes(authorized_member)) {
			$.notify('Deze persoon is al door iemand anders gemachtigd');
			return;
		}

		alvs[alv_id].auths[authorizing_member] = authorized_member;
		auth_form[0].reset();
		$("#auth_modal").modal('hide');
		render_template(alv_id);
	});

	agenda_form.on('submit', (e) => {
		e.preventDefault();

		let name = $('#agenda_name').val();
		let voting_option = parseInt($('#agenda_voting_option').find('option:selected').val());
		let alv_id = parseInt($('#agenda_modal_alv_id').val());

		alvs[alv_id].agenda.push({
			'name': name,
			'voting_option': voting_option,
			'votings': []
		});
		agenda_form[0].reset();
		$('#agenda_item_modal').modal('hide');
		render_template(alv_id);
	});

	alv_form.on('submit', (e) => {
		e.preventDefault();

		let name = $('#alv_name').val();
		let date = $('#alv_date').val();
		let time = $('#alv_start_time').val();
		let members = $('#alv_members').val();

		members = members.split('\n').filter((el) => el);
		alvs.push({
			'name': name,
			'date': date,
			'start_time': time,
			'members': members,
			'auths': {},
			'agenda': [],
			'presence': [...Array(members.length).keys()]
		});
		alv_form[0].reset();
		$('#alv_modal').modal('hide');
		render_template(alvs.length - 1);
	});

	vote_form.on('submit', (e) => {
		e.preventDefault();

		let votes_yes = parseInt($('#vote_modal_amount_yes').val());
		let votes_no = parseInt($('#vote_modal_amount_no').val());
		let votes_blank = parseInt($('#vote_modal_amount_blank').val());
		let votes_abstain = parseInt($('#vote_modal_amount_abstain').val());
		let alv_id = parseInt($('#vote_modal_alv_id').val());
		let agenda_id = parseInt($('#vote_modal_agenda_id').val());
		let name = $('#vote_modal_name').val();

		let result = get_voting_result(alv_id, agenda_id, votes_yes, votes_no, votes_blank, votes_abstain, alvs[alv_id].presence);

		if (result.startsWith('Voorstel aangenomen')) {
			$.notify('Voorstel aangenomen', 'success');

			if (result.length > 25) {
				$.notify(result.slice(21), 'info');
			}
		} else {
			$.notify(result, 'error')
		}

		if (!result.startsWith('Ongeldig')) {
			alvs[alv_id].agenda[agenda_id].votings.push({
				'amount_yes': votes_yes,
				'amount_no': votes_no,
				'amount_blank': votes_blank,
				'amount_abstain': votes_abstain,
				'presence': alvs[alv_id].presence,
				'name': name
			});
			$('#vote_modal').modal('hide');
			render_template(alv_id);
		}
	});

	// Register helpers
	Handlebars.registerHelper('voting', function (voting_option) {
		return voting_options[voting_option].type;
	});
	Handlebars.registerHelper('presenceButton', function (member_id, presence) {
		return presence.includes(member_id) ? 'accept_button' : 'delete';
	});
	Handlebars.registerHelper('openStrike', function (authorizing_member, authorized_member, presence) {
		return new Handlebars.SafeString(is_valid_auth(authorizing_member, authorized_member, presence) ? '' : '<strike>')
	});
	Handlebars.registerHelper('closeStrike', function (authorizing_member, authorized_member, presence) {
		return new Handlebars.SafeString(is_valid_auth(authorizing_member, authorized_member, presence) ? '' : '</strike>')
	});
	Handlebars.registerHelper('result', function (alv_id, agenda_id, voting_id) {
		let voting = alvs[alv_id].agenda[agenda_id].votings[voting_id];
		return get_voting_result(alv_id, agenda_id, voting.amount_yes, voting.amount_no, voting.amount_blank, voting.amount_abstain, voting.presence);
	});

	// Render the whole shebang!
	template = Handlebars.compile($('#alv-accordion-template').html());
});

function get_voting_result(alv_id, agenda_id, yes, no, blank, abstain, presence) {
	let alv = alvs[alv_id];
	let agenda = alv.agenda[agenda_id];
	let auths = alv.auths;
	let votes_total = yes + no + blank + abstain;
	let valid_votes_total = yes + no + blank;
	let total_nr_members = alv.members.length;

	// Get amount of valid auths
	let auth_count = 0;
	for (let key in auths) {
		if (auths.hasOwnProperty(key)) {
			if (is_valid_auth(key, auths[key], presence)) {
				auth_count++;
			}
		}
	}

	if (votes_total !== presence.length + auth_count) {
		return 'Ongeldig aantal uitgebrachte stemmen: ' + votes_total + '/' + (presence.length + auth_count);
	}

	// Check amount of votes
	let total_votes_limit = Math.ceil(total_nr_members * voting_options[agenda.voting_option].votes_amount);
	if (votes_total < total_votes_limit) {
		return 'Aantal stemmen is niet genoeg om dit voorstel aan te nemen: ' + votes_total + '/' + total_votes_limit + ', dus het wordt verworpen.';
	}

	let upvote_limit = Math.ceil(valid_votes_total * voting_options[agenda.voting_option].votes_true);
	if (yes < upvote_limit) {
		return 'Aantal stemmen voor is niet genoeg om dit voorstel aan te nemen: ' + yes + '/' + upvote_limit + ', dus het wordt verworpen.';
	}

	let out = 'Voorstel aangenomen. ';
	let quorum_limit = Math.ceil(voting_options[agenda.voting_option].quorum * total_nr_members);
	if (presence.length < quorum_limit) {
		out += 'Quorum niet gehaald: ' + presence.length + '/' + quorum_limit + '), dus het wordt een conceptbesluit.';
	}

	return out;
}

function is_valid_auth(authorizing_member, authorized_member, presence) {
	return !presence.includes(parseInt(authorizing_member)) && presence.includes(parseInt(authorized_member));
}

function render_template(alv_id) {
	let agenda_scroll = 0;
	let members_scroll = 0;
	let auths_scroll = 0;

	// Get scroll positions, which might be undefined
	if (alv_id !== undefined) {
		agenda_scroll = $('#agenda-wrapper_alv_' + alv_id).scrollTop() || 0;
		members_scroll = $('#members-wrapper_alv_' + alv_id).scrollTop() || 0;
		auths_scroll = $('#auths-wrapper_alv_' + alv_id).scrollTop() || 0;
	}

	$('#alv-accordion').html(template({'alvs': alvs}));

	// Restore ALV and scroll positions
	if (alv_id !== undefined) {
		$('#alv_collapse_' + alv_id).addClass('show');

		$('#agenda-wrapper_alv_' + alv_id).scrollTop(agenda_scroll);
		$('#members-wrapper_alv_' + alv_id).scrollTop(members_scroll);
		$('#auths-wrapper_alv_' + alv_id).scrollTop(auths_scroll);
	}
}

function toggle_presence(alv_id, member_id) {
	if (alvs[alv_id].presence.includes(member_id)) {
		let index = alvs[alv_id].presence.indexOf(member_id);

		alvs[alv_id].presence.splice(index, 1);
	} else {
		alvs[alv_id].presence.push(member_id);
	}

	render_template(alv_id);
}

function delete_auth(alv_id, auth_id) {
	delete alvs[alv_id].auths[auth_id];

	render_template(alv_id);
}

function open_auth_modal(alv_id) {
	let auth_model_authorizing_member = $("#auth_authorizing_member");
	let auth_modal_authorized_member = $("#auth_authorized_member");

	auth_model_authorizing_member.empty();
	auth_modal_authorized_member.empty();

	let members = alvs[alv_id].members;
	for (let i = 0; i < members.length; i++) {
		let member = members[i];

		auth_model_authorizing_member.append($("<option></option>").attr("value", i).text(member));
		auth_modal_authorized_member.append($("<option></option>").attr("value", i).text(member));
	}

	$("#auth_modal_alv_id").val(alv_id);
	$("#auth_modal").modal();
}

function open_agenda_modal(alv_id) {
	let agenda_item_type = $('#agenda_voting_option');

	agenda_item_type.empty();
	for (let i = 0; i < voting_options.length; i++) {
		agenda_item_type.append($("<option></option>").attr("value", i).text(voting_options[i].type))
	}

	$("#agenda_modal_alv_id").val(alv_id);
	$("#agenda_item_modal").modal();
}

function agenda_start(alv_id, agenda_id) {
	let d = new Date();
	let h = d.getHours();
	let m = d.getMinutes();
	let s = d.getSeconds();

	if (h < 10) {
		h = '0' + h;
	}
	if (m < 10) {
		m = '0' + m;
	}
	if (s < 10) {
		s = '0' + s;
	}

	alvs[alv_id].agenda[agenda_id].start_time = h + ':' + m + ':' + s;
	render_template(alv_id);
}

function delete_agenda_item(alv_id, agenda_id) {
	alvs[alv_id].agenda.splice(agenda_id, 1);
	render_template(alv_id);
}

function open_vote_modal(alv_id, agenda_id) {
	$('#vote_modal_alv_id').val(alv_id);
	$('#vote_modal_agenda_id').val(agenda_id);
	$('#vote_modal_votes_total').val(alvs[alv_id].presence.length);
	$('#vote_modal').modal();
}

function export_alvs() {
	let a = document.createElement('a');
	let json = JSON.stringify(alvs);
	let blob = new Blob([json], {'type': 'octet/stream'});
	let url = window.URL.createObjectURL(blob);

	a.href = url;
	a.download = 'RSKiezersAnalyse.json';
	a.click();
	window.URL.revokeObjectURL(url);
}
