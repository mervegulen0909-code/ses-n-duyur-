import type { NotificationKind } from '@voxscore/core';

export type NotificationLocale = 'en' | 'tr' | 'es' | 'fr' | 'ar' | 'hi' | 'zh';
type Copy = { title: string; body: string };

const EN: Record<NotificationKind, Copy> = {
  battle_challenge: { title: 'New battle', body: 'A new battle pairing is ready for you.' },
  new_vote: { title: 'New vote', body: 'Someone just voted on your performance.' },
  rank_change: { title: 'Rank update', body: 'Your ranking on VoxScore changed.' },
  comment_reply: { title: 'New reply', body: 'Someone replied to your comment.' },
  performance_request_approved: { title: 'Request approved', body: 'Your performance is live!' },
  performance_request_rejected: { title: 'Request update', body: 'Your request was not approved.' },
  day1_comeback: { title: 'Your league is waiting', body: 'Today’s battles are live.' },
  league_week_started: { title: 'New league week', body: 'Your new cohort is live.' },
};

const COPY: Record<NotificationLocale, Record<NotificationKind, Copy>> = {
  en: EN,
  tr: {
    battle_challenge: { title: 'Yeni düello', body: 'Yeni bir düello eşleşmesi seni bekliyor.' },
    new_vote: { title: 'Yeni oy', body: 'Birisi performansına oy verdi.' },
    rank_change: { title: 'Sıralama güncellendi', body: 'VoxScore sıran değişti.' },
    comment_reply: { title: 'Yeni yanıt', body: 'Birisi yorumuna yanıt verdi.' },
    performance_request_approved: { title: 'İstek onaylandı', body: 'Performansın yayında!' },
    performance_request_rejected: { title: 'İstek güncellemesi', body: 'İsteğin onaylanmadı.' },
    day1_comeback: { title: 'Ligin seni bekliyor', body: 'Bugünün düelloları başladı.' },
    league_week_started: { title: 'Yeni lig haftası', body: 'Yeni grubun hazır.' },
  },
  es: {
    battle_challenge: { title: 'Nuevo duelo', body: 'Hay un nuevo duelo listo para ti.' },
    new_vote: { title: 'Nuevo voto', body: 'Alguien votó por tu actuación.' },
    rank_change: { title: 'Clasificación actualizada', body: 'Tu puesto en VoxScore cambió.' },
    comment_reply: { title: 'Nueva respuesta', body: 'Alguien respondió a tu comentario.' },
    performance_request_approved: {
      title: 'Solicitud aprobada',
      body: '¡Tu actuación ya está publicada!',
    },
    performance_request_rejected: {
      title: 'Solicitud actualizada',
      body: 'Tu solicitud no fue aprobada.',
    },
    day1_comeback: { title: 'Tu liga te espera', body: 'Los duelos de hoy ya están activos.' },
    league_week_started: { title: 'Nueva semana de liga', body: 'Tu nuevo grupo ya está activo.' },
  },
  fr: {
    battle_challenge: { title: 'Nouveau duel', body: 'Un nouveau duel vous attend.' },
    new_vote: { title: 'Nouveau vote', body: 'Quelqu’un a voté pour votre performance.' },
    rank_change: { title: 'Classement mis à jour', body: 'Votre rang VoxScore a changé.' },
    comment_reply: { title: 'Nouvelle réponse', body: 'Quelqu’un a répondu à votre commentaire.' },
    performance_request_approved: {
      title: 'Demande approuvée',
      body: 'Votre performance est en ligne !',
    },
    performance_request_rejected: {
      title: 'Demande mise à jour',
      body: 'Votre demande n’a pas été approuvée.',
    },
    day1_comeback: { title: 'Votre ligue vous attend', body: 'Les duels du jour sont ouverts.' },
    league_week_started: { title: 'Nouvelle semaine', body: 'Votre nouveau groupe est ouvert.' },
  },
  ar: {
    battle_challenge: { title: 'مواجهة جديدة', body: 'هناك مواجهة جديدة بانتظارك.' },
    new_vote: { title: 'تصويت جديد', body: 'صوّت شخص ما لأدائك.' },
    rank_change: { title: 'تحديث الترتيب', body: 'تغيّر ترتيبك في VoxScore.' },
    comment_reply: { title: 'رد جديد', body: 'ردّ شخص ما على تعليقك.' },
    performance_request_approved: { title: 'تمت الموافقة', body: 'أداؤك متاح الآن!' },
    performance_request_rejected: { title: 'تحديث الطلب', body: 'لم تتم الموافقة على طلبك.' },
    day1_comeback: { title: 'دوريك بانتظارك', body: 'مواجهات اليوم متاحة الآن.' },
    league_week_started: { title: 'أسبوع دوري جديد', body: 'مجموعتك الجديدة متاحة.' },
  },
  hi: {
    battle_challenge: { title: 'नई बैटल', body: 'आपके लिए नई बैटल तैयार है।' },
    new_vote: { title: 'नया वोट', body: 'किसी ने आपके प्रदर्शन को वोट दिया।' },
    rank_change: { title: 'रैंक अपडेट', body: 'VoxScore पर आपकी रैंक बदल गई।' },
    comment_reply: { title: 'नया जवाब', body: 'किसी ने आपकी टिप्पणी का जवाब दिया।' },
    performance_request_approved: { title: 'अनुरोध स्वीकृत', body: 'आपका प्रदर्शन लाइव है!' },
    performance_request_rejected: { title: 'अनुरोध अपडेट', body: 'आपका अनुरोध स्वीकृत नहीं हुआ।' },
    day1_comeback: { title: 'आपकी लीग इंतज़ार कर रही है', body: 'आज की बैटल लाइव हैं।' },
    league_week_started: { title: 'नया लीग सप्ताह', body: 'आपका नया समूह लाइव है।' },
  },
  zh: {
    battle_challenge: { title: '新对决', body: '新的对决已经准备好了。' },
    new_vote: { title: '新投票', body: '有人为你的表演投票了。' },
    rank_change: { title: '排名更新', body: '你的 VoxScore 排名发生了变化。' },
    comment_reply: { title: '新回复', body: '有人回复了你的评论。' },
    performance_request_approved: { title: '申请已通过', body: '你的表演已上线！' },
    performance_request_rejected: { title: '申请更新', body: '你的申请未获通过。' },
    day1_comeback: { title: '联赛等你回来', body: '今天的对决已经开始。' },
    league_week_started: { title: '新联赛周', body: '你的新分组已经开始。' },
  },
};

export function notificationCopy(kind: NotificationKind, locale: string | null | undefined): Copy {
  const selected = locale && locale in COPY ? (locale as NotificationLocale) : 'en';
  return COPY[selected][kind] ?? EN[kind];
}
