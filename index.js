// Gerekli kütüphaneleri ve dosyaları içe aktarma
const {
    Client,
    GatewayIntentBits,
    PermissionsBitField,
    REST,
    Routes,
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    PermissionFlagsBits,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    Events
} = require('discord.js');
const {
    token // guildId kaldırıldı!
} = require('./config.json');

const fs = require('fs');
const path = require('path');

// Veri dosyasının yolu
const DATA_FILE = path.join(__dirname, 'data.json');

// Yetki kısıtlamasının uygulanacağı sunucu ID'si (1238594650617548861)
const RESTRICTED_GUILD_ID = '1425177407408570531'; 

// Kelime oyunu için örnek Türkçe kelimeler (daha fazlasını ekleyebilirsiniz)
// BURASI GÜNCELLENDİ: 'ayakkabı', 'araba', 'asker', 'adam', 'altın' eklendi.
const turkceKelimeler = ['elma', 'armut', 'kelime', 'anahtar', 'kapı', 'masa', 'sandalye', 'telefon', 'bilgisayar', 'bahçe', 'ayakkabı', 'araba', 'asker', 'adam', 'altın'];
const BOOM_NUMBER = 3; // Boom oyunu için kural sayısı

// Veri saklama objesi
let data = {
    kufurEngeliAcik: false,
    linkEngeliAcik: false,
    engellenenKufurKanallari: new Set(),
    engellenenLinkKanallari: new Set(),
    engellenenKufurRolleri: new Set(),
    engellenenLinkRolleri: new Set(),
    ticketData: {},
    userCooldowns: {},
    kelimeOyunları: {},
    boomOyunları: {},
    sicilSistemi: {
        logsChannelId: null,
        records: {}
    },
    userTickets: {},
    botKoruma: {
        enabled: false,
        verifiedBots: new Set(), // İzin verilen bot ID'leri
        notificationUserId: "909830852798713877" // Bildirimlerin gönderileceği kullanıcı ID'si
    }
};

// Veriyi dosyaya kaydeden yardımcı fonksiyon
function saveData() {
    try {
        const dataToSave = {
            ...data,
            engellenenKufurKanallari: Array.from(data.engellenenKufurKanallari),
            engellenenLinkKanallari: Array.from(data.engellenenLinkKanallari),
            engellenenKufurRolleri: Array.from(data.engellenenKufurRolleri),
            engellenenLinkRolleri: Array.from(data.engellenenLinkRolleri),
            botKoruma: {
                ...data.botKoruma,
                verifiedBots: Array.from(data.botKoruma.verifiedBots)
            }
        };
        fs.writeFileSync(DATA_FILE, JSON.stringify(dataToSave, null, 2));
    } catch (err) {
        console.error('Veri dosyaya kaydedilirken bir hata oluştu:', err);
    }
}

// Veriyi dosyadan okuyan yardımcı fonksiyon
function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const fileContent = fs.readFileSync(DATA_FILE, 'utf8');
            const loadedData = JSON.parse(fileContent);
            data = {
                ...loadedData,
                engellenenKufurKanallari: new Set(loadedData.engellenenKufurKanallari || []),
                engellenenLinkKanallari: new Set(loadedData.engellenenLinkKanallari || []),
                engellenenKufurRolleri: new Set(loadedData.engellenenKufurRolleri || []),
                engellenenLinkRolleri: new Set(loadedData.engellenenLinkRolleri || []),
                botKoruma: {
                    ...loadedData.botKoruma,
                    verifiedBots: new Set(loadedData.botKoruma?.verifiedBots || [])
                }
            };
            console.log('Veri başarıyla yüklendi.');
        } else {
            console.log('Veri dosyası bulunamadı, yeni dosya oluşturuluyor...');
            saveData();
        }
    } catch (err) {
        console.error('Veri dosyası okunurken bir hata oluştu:', err);
    }
}

// Otomatik moderasyon için durum değişkenleri
const kufurler = ['amk', 'oros', 'piç', 'sg', 'siktir', 'göt', 'mal', 'orospu'];
const linkRegex = /(https?:\/\/[^\s]+)/g;

const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
    res.send("Bot çalışıyor! ✅");
});

app.listen(PORT, () => {
    console.log(`HTTP sunucu ${PORT} portunda çalışıyor`);
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildInvites // Bot ekleme algılaması için gerekli
    ]
});

// Yetki kontrolü için yardımcı fonksiyon
function hasRole(member, roleIds) {
    if (!member) return false;
    return roleIds.some(roleId => member.roles.cache.has(roleId));
}

const commands = [
    // Moderasyon Komutları
    new SlashCommandBuilder()
    .setName('yasakla')
    .setDescription('Belirtilen kullanıcıyı sunucudan yasaklar.')
    .addUserOption(option => option.setName('kişi').setDescription('Yasaklanacak kişi (etiket veya ID)').setRequired(true))
    .addStringOption(option => option.setName('sebep').setDescription('Yasaklama sebebi').setRequired(true)),

    new SlashCommandBuilder()
    .setName('yasak-kaldır')
    .setDescription('Belirtilen ID\'deki kişinin yasağını kaldırır.')
    .addStringOption(option => option.setName('id').setDescription('Yasağı kaldırılacak kişinin ID\'si').setRequired(true)),

    new SlashCommandBuilder()
    .setName('at')
    .setDescription('Belirtilen kullanıcıyı sunucudan atar.')
    .addUserOption(option => option.setName('kişi').setDescription('Atılacak kişi (etiket veya ID)').setRequired(true))
    .addStringOption(option => option.setName('sebep').setDescription('Atılma sebebi').setRequired(true)),

    new SlashCommandBuilder()
    .setName('sustur')
    .setDescription('Belirtilen kişiye süreli susturma atar.')
    .addUserOption(option => option.setName('kişi').setDescription('Susturulacak kişi').setRequired(true))
    .addIntegerOption(option => option.setName('süre').setDescription('Susturma süresi (dakika)').setRequired(true).setMinValue(1))
    .addStringOption(option => option.setName('sebep').setDescription('Susturma sebebi').setRequired(true)),

    new SlashCommandBuilder()
    .setName('susturmayı-kaldır')
    .setDescription('Belirtilen kişinin susturmasını kaldırır.')
    .addUserOption(option => option.setName('kişi').setDescription('Susturması kaldırılacak kişi').setRequired(true)),

    new SlashCommandBuilder()
    .setName('otomod')
    .setDescription('Otomatik moderasyon ayarlarını yapar.')
    .addSubcommand(subcommand => subcommand.setName('küfür_engel').setDescription('Küfür engelleme ayarları.').addStringOption(option => option.setName('durum').setDescription('Aç veya Kapat').setRequired(true).addChoices({
        name: 'Aç',
        value: 'aç'
    }, {
        name: 'Kapat',
        value: 'kapat'
    })).addChannelOption(option => option.setName('engellenen_kanal').setDescription('Otomatize sistemin uygulanmayacağı kanal.').addChannelTypes(ChannelType.GuildText)).addRoleOption(option => option.setName('engellenen_rol').setDescription('Otomatize sistemin uygulanmayacağı rol.')))
    .addSubcommand(subcommand => subcommand.setName('link_engel').setDescription('Link engelleme ayarları.').addStringOption(option => option.setName('durum').setDescription('Aç veya Kapat').setRequired(true).addChoices({
        name: 'Aç',
        value: 'aç'
    }, {
        name: 'Kapat',
        value: 'kapat'
    })).addChannelOption(option => option.setName('engellenen_kanal').setDescription('Otomatize sistemin uygulanmayacağı kanal.').addChannelTypes(ChannelType.GuildText)).addRoleOption(option => option.setName('engellenen_rol').setDescription('Otomatize sistemin uygulanmayacağı rol.'))),

    new SlashCommandBuilder()
    .setName('sil')
    .setDescription('Belirtilen miktarda mesajı siler (en fazla 100).')
    .addIntegerOption(option => option.setName('miktar').setDescription('Silinecek mesaj sayısı (1-100)').setRequired(true).setMinValue(1).setMaxValue(100)),

    new SlashCommandBuilder()
    .setName('sıfırla')
    .setDescription('Kanalları sıfırlar.')
    .addChannelOption(option => option.setName('kanal').setDescription('Sıfırlanacak kanal (boş bırakılırsa bu kanal sıfırlanır).').addChannelTypes(ChannelType.GuildText)),

    // Bilet Sistemi Komutu
    new SlashCommandBuilder()
    .setName('bilet-kur')
    .setDescription('Destek sistemi panelini kurar.')
    .addStringOption(option => option.setName('sunucu-destek-rolleri').setDescription('Sunucu desteği görebilecek rollerin ID\'leri (virgülle ayırın)').setRequired(true))
    .addStringOption(option => option.setName('oyun-destek-rolleri').setDescription('Oyun içi destek görebilecek rollerin ID\'leri (virgülle ayırın)').setRequired(true))
    .addStringOption(option => option.setName('gamepass-destek-rolleri').setDescription('Gamepass desteği görebilecek rollerin ID\'leri (virgülle ayırın)').setRequired(true))
    .addChannelOption(option => option.setName('kayıt-kanalı').setDescription('Bilet kayıtlarının gönderileceği kanal.').addChannelTypes(ChannelType.GuildText).setRequired(true))
    .addChannelOption(option => option.setName('komut-kanal').setDescription('Destek sistemi mesajının gönderileceği kanal.').addChannelTypes(ChannelType.GuildText).setRequired(true))
    .addChannelOption(option => option.setName('destek-kategorisi').setDescription('Biletlerin açılacağı kategori.').addChannelTypes(ChannelType.GuildCategory).setRequired(true)),

    // Oyun Komutları
    new SlashCommandBuilder()
    .setName('kelime_oyunu')
    .setDescription('Belirtilen kanalda kelime oyunu başlatır.')
    .addChannelOption(option => option.setName('kanal').setDescription('Kelime oyununun oynanacağı kanal.').addChannelTypes(ChannelType.GuildText).setRequired(true)),

    new SlashCommandBuilder()
    .setName('boom')
    .setDescription('Belirtilen kanalda boom oyunu başlatır.')
    .addChannelOption(option => option.setName('kanal').setDescription('Boom oyununun oynanacağı kanal.').addChannelTypes(ChannelType.GuildText).setRequired(true)),

    new SlashCommandBuilder()
    .setName('oyun_bitir')
    .setDescription('Belirtilen kanaldaki kelime veya boom oyununu bitirir.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels) // Bu komutu sadece yetkililer kullanabilir
    .addChannelOption(option => option.setName('kanal').setDescription('Oyunun bitirileceği kanal.').addChannelTypes(ChannelType.GuildText).setRequired(true)),

    // SICIL SISTEMI KOMUTLARI
    new SlashCommandBuilder()
    .setName('sicil_sistem')
    .setDescription('Sicil sistemi log kanalını belirler.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addChannelOption(option => option.setName('kanal').setDescription('Sicil loglarının gönderileceği kanal.').addChannelTypes(ChannelType.GuildText).setRequired(true)),

    new SlashCommandBuilder()
    .setName('sicil_kayıt')
    .setDescription('Belirtilen Roblox adının siciline ceza ekler.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addStringOption(option => option.setName('kişi').setDescription('Sicili kaydedilecek kişinin Roblox adı.').setRequired(true))
    .addStringOption(option => option.setName('ceza').setDescription('Eklenecek cezanın türü.').setRequired(true))
    .addStringOption(option => option.setName('süre').setDescription('Cezanın süresi (örn: "1 saat", "1 gün").').setRequired(true))
    .addStringOption(option => option.setName('sebep').setDescription('Cezanın sebebi.').setRequired(true)),

    new SlashCommandBuilder()
    .setName('sicil_görüntüle')
    .setDescription('Bir kişinin sicilini görüntüler.')
    .addStringOption(option => option.setName('isim').setDescription('Sicili görüntülenecek kişinin Roblox adı.').setRequired(true)),

    new SlashCommandBuilder()
    .setName('sicil_ceza_kaldır')
    .setDescription('Bir kişinin sicilinden ceza kaldırır.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addStringOption(option => option.setName('isim').setDescription('Sicilinden ceza kaldırılacak kişinin Roblox adı.').setRequired(true)),

    // BOT KORUMA KOMUTLARI
    new SlashCommandBuilder()
    .setName('bot_koruma')
    .setDescription('Sunucuya eklenen botları otomatik olarak yönetir.')
    .addStringOption(option => option.setName('durum').setDescription('Sistemi Aç veya Kapat').setRequired(true).addChoices({
        name: 'Aç',
        value: 'aç'
    }, {
        name: 'Kapat',
        value: 'kapat'
    }))
    .addUserOption(option => option.setName('bildirim_kullanıcısı').setDescription('Bot ekleme bildirimlerinin gideceği kullanıcı (varsayılan: 909830852798713877).').setRequired(false)),

    new SlashCommandBuilder()
    .setName('bot_izin')
    .setDescription('Belirli botlara sunucuya girmeleri için izin verir veya bu izinleri kaldırır.')
    .addSubcommand(subcommand => subcommand.setName('ver')
        .setDescription('Belirli bir bota sunucuya girmesi için izin verir.')
        .addUserOption(option => option.setName('bot').setDescription('İzin verilecek botu etiketleyin.').setRequired(true)))
    .addSubcommand(subcommand => subcommand.setName('kaldır')
        .setDescription('Belirli bir bottan sunucuya girme iznini kaldırır.')
        .addUserOption(option => option.setName('bot').setDescription('İznini kaldırılacak botu etiketleyin.').setRequired(true))),

    new SlashCommandBuilder()
    .setName('bot_izin_verilenler')
    .setDescription('Sunucuya izin verilmiş botların listesini gösterir.'),

    // GLOBAL MODERASYON KOMUTLARI
    new SlashCommandBuilder()
    .setName('tüm_sunuculardan_yasakla')
    .setDescription('Belirtilen kullanıcıyı listedeki tüm sunuculardan yasaklar.')
    .addStringOption(option => option.setName('kişi').setDescription('Yasaklanacak kişi (etiket veya ID)').setRequired(true))
    .addStringOption(option => option.setName('sebep').setDescription('Yasaklama sebebi').setRequired(true)),

    new SlashCommandBuilder()
    .setName('tüm_sunucular_yasak-kaldır')
    .setDescription('Belirtilen kişinin tüm sunuculardan yasağını kaldırır.')
    .addStringOption(option => option.setName('kişi_id').setDescription('Yasağı kaldırılacak kişinin ID\'si').setRequired(true))
];

client.once('clientReady', async () => {
    console.log(`Bot ${client.user.tag} olarak giriş yaptı!`);
    loadData(); // Bot başlatıldığında veriyi yükle
    try {
        const rest = new REST({
            version: '10'
        }).setToken(token);
        console.log('Tüm sunucular için global komutlar güncelleniyor.');

        // Tüm komutları global olarak kaydet
        await rest.put(
            Routes.applicationCommands(client.user.id), {
                body: commands
            }
        );
        console.log('Global komutlar başarıyla güncellendi! (Komutların tüm sunuculara yayılması 1 saati bulabilir.)');
    } catch (error) {
        console.error(error);
    }
});

client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        const {
            commandName,
            options
        } = interaction;

        // Yetki kontrolü için özel roller
        const modRoles1 = ['1425177408222396594', '1425177408151224411'];
        const modRoles2 = ['1425177408222396594', '1425177408151224410'];

        const hasModRole1 = hasRole(interaction.member, modRoles1);
        const hasModRole2 = hasRole(interaction.member, modRoles2);

        // Sunucu ID'si kontrolü
        const isRestrictedGuild = interaction.guildId === RESTRICTED_GUILD_ID;

        // Yetki kontrol fonksiyonu
        const checkPermission = (requiredPermission, requiredRoles) => {
            if (isRestrictedGuild) {
                return requiredRoles(); // Belirtilen rollerden birine sahip mi?
            } else {
                return interaction.member.permissions.has(requiredPermission); // Standart Discord yetkisine sahip mi?
            }
        };

        // Kullanıcıya gönderilecek yetkisizlik mesajı
        const getNoPermissionMessage = (requiredPermissionName) => {
            if (isRestrictedGuild) {
                return 'Bu komutu kullanmak için gerekli özel moderatör rollerine sahip değilsiniz.';
            } else {
                return `Bu komutu kullanmak için \`${requiredPermissionName}\` yetkiniz olmalı.`;
            }
        };

        switch (commandName) {
            case 'yasakla': {
                // YETKİ KONTROLÜ
                if (!checkPermission(PermissionsBitField.Flags.BanMembers, () => hasModRole1)) {
                    return interaction.reply({
                        content: getNoPermissionMessage('Üyeleri Yasakla'),
                        ephemeral: true
                    });
                }

                const member = options.getMember('kişi');
                const sebep = options.getString('sebep');
                const moderator = interaction.member;
                const botMember = interaction.guild.members.me;

                if (!moderator.permissions.has(PermissionsBitField.Flags.BanMembers) && !isRestrictedGuild) {
                    return interaction.reply({
                        content: 'Bu komutu kullanmak için `Üyeleri Yasakla` yetkiniz olmalı.',
                        ephemeral: true
                    });
                }
                if (!member) {
                    return interaction.reply({
                        content: 'Geçersiz kullanıcı.',
                        ephemeral: true
                    });
                }
                if (member.id === interaction.user.id) {
                    return interaction.reply({
                        content: 'Kendini yasaklayamazsın.',
                        ephemeral: true
                    });
                }
                if (member.id === botMember.id) {
                    return interaction.reply({
                        content: 'Beni yasaklayamazsın.',
                        ephemeral: true
                    });
                }
                if (member.roles.highest.position >= botMember.roles.highest.position) {
                    return interaction.reply({
                        content: 'Bu kullanıcı senden veya benden daha yüksek bir role sahip, yasaklayamam.',
                        ephemeral: true
                    });
                }

                try {
                    await member.ban({
                        reason: sebep
                    });
                    await interaction.reply({
                        content: `${member.user.tag} kullanıcısı, \`${sebep}\` sebebiyle yasaklandı.`,
                        ephemeral: false
                    });
                } catch (error) {
                    console.error(error);
                    await interaction.reply({
                        content: 'Yasaklama işlemi sırasında bir hata oluştu.',
                        ephemeral: true
                    });
                }
                break;
            }

            case 'yasak-kaldır': {
                // YETKİ KONTROLÜ
                if (!checkPermission(PermissionsBitField.Flags.BanMembers, () => hasModRole1)) {
                    return interaction.reply({
                        content: getNoPermissionMessage('Üyeleri Yasakla'),
                        ephemeral: true
                    });
                }

                const userId = options.getString('id');
                const moderator = interaction.member;

                if (!moderator.permissions.has(PermissionsBitField.Flags.BanMembers) && !isRestrictedGuild) {
                    return interaction.reply({
                        content: 'Bu komutu kullanmak için `Üyeleri Yasakla` yetkiniz olmalı.',
                        ephemeral: true
                    });
                }

                try {
                    const banList = await interaction.guild.bans.fetch();
                    const bannedUser = banList.find(ban => ban.user.id === userId);

                    if (!bannedUser) {
                        return interaction.reply({
                            content: 'Belirtilen ID\'ye sahip yasaklı bir kullanıcı bulunamadı.',
                            ephemeral: true
                        });
                    }

                    await interaction.guild.bans.remove(userId);
                    await interaction.reply({
                        content: `${bannedUser.user.tag} kullanıcısının yasağı kaldırıldı.`,
                        ephemeral: false
                    });
                } catch (error) {
                    console.error(error);
                    await interaction.reply({
                        content: 'Yasak kaldırma işlemi sırasında bir hata oluştu.',
                        ephemeral: true
                    });
                }
                break;
            }

            case 'at': {
                // YETKİ KONTROLÜ
                if (!checkPermission(PermissionsBitField.Flags.KickMembers, () => hasModRole1)) {
                    return interaction.reply({
                        content: getNoPermissionMessage('Üyeleri At'),
                        ephemeral: true
                    });
                }

                const member = options.getMember('kişi');
                const sebep = options.getString('sebep');
                const moderator = interaction.member;
                const botMember = interaction.guild.members.me;

                if (!moderator.permissions.has(PermissionsBitField.Flags.KickMembers) && !isRestrictedGuild) {
                    return interaction.reply({
                        content: 'Bu komutu kullanmak için `Üyeleri At` yetkiniz olmalı.',
                        ephemeral: true
                    });
                }
                if (!member) {
                    return interaction.reply({
                        content: 'Geçersiz kullanıcı.',
                        ephemeral: true
                    });
                }
                if (member.id === interaction.user.id) {
                    return interaction.reply({
                        content: 'Kendini atamazsın.',
                        ephemeral: true
                    });
                }
                if (member.id === botMember.id) {
                    return interaction.reply({
                        content: 'Beni atamazsın.',
                        ephemeral: true
                    });
                }
                if (member.roles.highest.position >= botMember.roles.highest.position) {
                    return interaction.reply({
                        content: 'Bu kullanıcı senden veya benden daha yüksek bir role sahip, atamam.',
                        ephemeral: true
                    });
                }

                try {
                    await member.kick({
                        reason: sebep
                    });
                    await interaction.reply({
                        content: `${member.user.tag} kullanıcısı, \`${sebep}\` sebebiyle sunucudan atıldı.`,
                        ephemeral: false
                    });
                } catch (error) {
                    console.error(error);
                    await interaction.reply({
                        content: 'Atma işlemi sırasında bir hata oluştu.',
                        ephemeral: true
                    });
                }
                break;
            }

            case 'sustur': {
                // YETKİ KONTROLÜ
                if (!checkPermission(PermissionsBitField.Flags.MuteMembers, () => hasModRole1)) {
                    return interaction.reply({
                        content: getNoPermissionMessage('Üyeleri Sustur'),
                        ephemeral: true
                    });
                }

                const member = options.getMember('kişi');
                const sure = options.getInteger('süre');
                const sebep = options.getString('sebep');
                const moderator = interaction.member;
                const botMember = interaction.guild.members.me;

                if (!moderator.permissions.has(PermissionsBitField.Flags.MuteMembers) && !isRestrictedGuild) {
                    return interaction.reply({
                        content: 'Bu komutu kullanmak için `Üyeleri Sustur` yetkiniz olmalı.',
                        ephemeral: true
                    });
                }
                if (!member) {
                    return interaction.reply({
                        content: 'Geçersiz kullanıcı.',
                        ephemeral: true
                    });
                }
                if (member.id === interaction.user.id) {
                    return interaction.reply({
                        content: 'Kendini susturamazsın.',
                        ephemeral: true
                    });
                }
                if (member.id === botMember.id) {
                    return interaction.reply({
                        content: 'Beni susturamazsın.',
                        ephemeral: true
                    });
                }
                if (member.roles.highest.position >= botMember.roles.highest.position) {
                    return interaction.reply({
                        content: 'Bu kullanıcı senden veya benden daha yüksek bir role sahip, susturamam.',
                        ephemeral: true
                    });
                }
                if (member.isCommunicationDisabled()) {
                    return interaction.reply({
                        content: 'Bu kullanıcı zaten susturulmuş durumda.',
                        ephemeral: true
                    });
                }

                try {
                    const timeoutSeconds = sure * 60; // Discord API saniye cinsinden süre ister
                    await member.timeout(timeoutSeconds * 1000, sebep);
                    await interaction.reply({
                        content: `${member.user.tag} kullanıcısı, \`${sure} dakika\` boyunca susturuldu. Sebep: \`${sebep}\`.`,
                        ephemeral: false
                    });
                } catch (error) {
                    console.error(error);
                    await interaction.reply({
                        content: 'Susturma işlemi sırasında bir hata oluştu.',
                        ephemeral: true
                    });
                }
                break;
            }

            case 'susturmayı-kaldır': {
                // YETKİ KONTROLÜ
                if (!checkPermission(PermissionsBitField.Flags.MuteMembers, () => hasModRole1)) {
                    return interaction.reply({
                        content: getNoPermissionMessage('Üyeleri Sustur'),
                        ephemeral: true
                    });
                }

                const member = options.getMember('kişi');
                const moderator = interaction.member;

                if (!moderator.permissions.has(PermissionsBitField.Flags.MuteMembers) && !isRestrictedGuild) {
                    return interaction.reply({
                        content: 'Bu komutu kullanmak için `Üyeleri Sustur` yetkiniz olmalı.',
                        ephemeral: true
                    });
                }
                if (!member) {
                    return interaction.reply({
                        content: 'Geçersiz kullanıcı.',
                        ephemeral: true
                    });
                }

                try {
                    if (!member.isCommunicationDisabled()) {
                        return interaction.reply({
                            content: 'Bu kullanıcı zaten susturulmuş değil.',
                            ephemeral: true
                        });
                    }

                    await member.timeout(null); // Süre sıfırlanarak susturma kaldırılır
                    await interaction.reply({
                        content: `${member.user.tag} kullanıcısının susturması kaldırıldı.`,
                        ephemeral: false
                    });
                } catch (error) {
                    console.error(error);
                    await interaction.reply({
                        content: 'Susturma kaldırma işlemi sırasında bir hata oluştu.',
                        ephemeral: true
                    });
                }
                break;
            }

            case 'otomod': {
                const subcommand = options.getSubcommand();
                const durum = options.getString('durum');
                const engellenenKanal = options.getChannel('engellenen_kanal');
                const engellenenRol = options.getRole('engellenen_rol');

                if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
                    return await interaction.reply({
                        content: 'Bu komutu kullanmak için `Sunucuyu Yönet` yetkiniz olmalı.',
                        ephemeral: true
                    });
                }

                if (subcommand === 'küfür_engel') {
                    data.kufurEngeliAcik = durum === 'aç';
                    if (engellenenKanal) {
                        if (durum === 'aç') {
                            data.engellenenKufurKanallari.add(engellenenKanal.id);
                        } else {
                            data.engellenenKufurKanallari.delete(engellenenKanal.id);
                        }
                    }
                    if (engellenenRol) {
                        if (durum === 'aç') {
                            data.engellenenKufurRolleri.add(engellenenRol.id);
                        } else {
                            data.engellenenKufurRolleri.delete(engellenenRol.id);
                        }
                    }
                    saveData();
                    await interaction.reply({
                        content: `Küfür engelleme sistemi ${durum === 'aç' ? 'açıldı' : 'kapatıldı'}.`,
                        ephemeral: true
                    });
                } else if (subcommand === 'link_engel') {
                    data.linkEngeliAcik = durum === 'aç';
                    if (engellenenKanal) {
                        if (durum === 'aç') {
                            data.engellenenLinkKanallari.add(engellenenKanal.id);
                        } else {
                            data.engellenenLinkKanallari.delete(engellenenKanal.id);
                        }
                    }
                    if (engellenenRol) {
                        if (durum === 'aç') {
                            data.engellenenLinkRolleri.add(engellenenRol.id);
                        } else {
                            data.engellenenLinkRolleri.delete(engellenenRol.id);
                        }
                    }
                    saveData();
                    await interaction.reply({
                        content: `Link engelleme sistemi ${durum === 'aç' ? 'açıldı' : 'kapatıldı'}.`,
                        ephemeral: true
                    });
                }
                break;
            }

            case 'sil': {
                // YETKİ KONTROLÜ
                if (!checkPermission(PermissionsBitField.Flags.ManageMessages, () => hasModRole1)) {
                    return interaction.reply({
                        content: getNoPermissionMessage('Mesajları Yönet'),
                        ephemeral: true
                    });
                }

                const miktar = options.getInteger('miktar');
                const channel = interaction.channel;
                const moderator = interaction.member;

                if (!moderator.permissions.has(PermissionsBitField.Flags.ManageMessages) && !isRestrictedGuild) {
                    return interaction.reply({
                        content: 'Bu komutu kullanmak için `Mesajları Yönet` yetkiniz olmalı.',
                        ephemeral: true
                    });
                }
                try {
                    await channel.bulkDelete(miktar, true);
                    const reply = await interaction.reply({
                        content: `${miktar} adet mesaj silindi.`,
                        ephemeral: false
                    });
                    setTimeout(async () => {
                        try {
                            await reply.delete();
                        } catch (err) {
                            if (err.code === 10008) {
                                console.log('Silme işlemi sırasında mesaj zaten silinmiş.');
                            } else {
                                console.error('Mesaj silinirken hata:', err);
                            }
                        }
                    }, 5000);
                } catch (error) {
                    console.error(error);
                    await interaction.reply({
                        content: 'Mesajları silerken bir hata oluştu.',
                        ephemeral: true
                    });
                }
                break;
            }

            case 'sıfırla': {
                // YETKİ KONTROLÜ
                if (!checkPermission(PermissionsBitField.Flags.ManageChannels, () => hasModRole2)) {
                    return interaction.reply({
                        content: getNoPermissionMessage('Kanalları Yönet'),
                        ephemeral: true
                    });
                }

                const channel = options.getChannel('kanal') || interaction.channel;
                const userPermissions = interaction.member.permissions;
                const botPermissions = interaction.guild.members.me.permissions;

                if (!userPermissions.has(PermissionsBitField.Flags.ManageChannels) && !isRestrictedGuild) {
                    return await interaction.reply({
                        content: 'Bu komutu kullanmak için `Kanalları Yönet` yetkisine sahip olmalısınız.',
                        ephemeral: true
                    });
                }
                if (!botPermissions.has(PermissionsBitField.Flags.ManageChannels)) {
                    return await interaction.reply({
                        content: 'Bu komutu kullanmak için botun `Kanalları Yönet` yetkisine sahip olması gerekmektedir.',
                        ephemeral: true
                    });
                }
                try {
                    const position = channel.position;
                    const newChannel = await interaction.guild.channels.create({
                        name: channel.name,
                        type: ChannelType.GuildText,
                        parent: channel.parent,
                        topic: channel.topic,
                        position: position,
                        permissionOverwrites: channel.permissionOverwrites.cache.map(overwrite => ({
                            id: overwrite.id,
                            allow: overwrite.allow.bitfield,
                            deny: overwrite.deny.bitfield
                        }))
                    });
                    await channel.delete('Sıfırlama komutu kullanıldı.');
                    await newChannel.send(`**<#${channel.id}>** kanalı başarılı bir şekilde sıfırlandı.`);
                    await interaction.reply({
                        content: `**<#${channel.id}>** kanalı başarılı bir şekilde sıfırlandı.`,
                        ephemeral: true
                    });
                } catch (err) {
                    if (err.code === 10003) {
                        return await interaction.reply({
                            content: 'Belirtilen kanal zaten silinmiş.',
                            ephemeral: true
                        });
                    }
                    console.error(err);
                    await interaction.reply({
                        content: 'Kanal sıfırlama işlemi sırasında bir hata oluştu.',
                        ephemeral: true
                    });
                }
                break;
            }

            case 'bilet-kur': {
                const {
                    guild
                } = interaction;
                const sunucuDestekRolleri = options.getString('sunucu-destek-rolleri').split(',').map(r => r.trim());
                const oyunDestekRolleri = options.getString('oyun-destek-rolleri').split(',').map(r => r.trim());
                const gamepassDestekRolleri = options.getString('gamepass-destek-rolleri').split(',').map(r => r.trim());
                const kayitKanal = options.getChannel('kayıt-kanalı');
                const komutKanal = options.getChannel('komut-kanal');
                const kategori = options.getChannel('destek-kategorisi');

                if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                    return await interaction.reply({
                        content: 'Bu komutu kullanmak için yönetici yetkiniz olmalıdır.',
                        ephemeral: true
                    });
                }

                data.ticketData.supportRoles = {
                    server: sunucuDestekRolleri,
                    game: oyunDestekRolleri,
                    gamepass: gamepassDestekRolleri
                };
                data.ticketData.logChannel = kayitKanal.id;
                data.ticketData.category = kategori.id;
                saveData();

                const ticketEmbed = new EmbedBuilder()
                    .setTitle('Destek Sistemi')
                    .setDescription('Açmak istediğiniz destek türünü seçin:')
                    .setColor('Aqua');

                const row = new ActionRowBuilder()
                    .addComponents(
                        new StringSelectMenuBuilder()
                        .setCustomId('ticket_select')
                        .setPlaceholder('Destek Türü Seçin')
                        .addOptions(
                            new StringSelectMenuOptionBuilder()
                            .setLabel('Sunucu Desteği')
                            .setDescription('Sunucu ile ilgili sorunlar için destek alın.')
                            .setValue('server_support'),
                            new StringSelectMenuOptionBuilder()
                            .setLabel('Oyun Desteği')
                            .setDescription('Oyun içi sorunlar için destek alın.')
                            .setValue('game_support'),
                            new StringSelectMenuOptionBuilder()
                            .setLabel('Gamepass Desteği')
                            .setDescription('Gamepass ile ilgili sorunlar için destek alın.')
                            .setValue('gamepass_support'),
                        ),
                    );

                try {
                    await komutKanal.send({
                        embeds: [ticketEmbed],
                        components: [row]
                    });
                    await interaction.reply({
                        content: 'Destek paneli başarıyla kuruldu!',
                        ephemeral: true
                    });
                } catch (error) {
                    console.error('Bilet paneli gönderilirken bir hata oluştu:', error);
                    await interaction.reply({
                        content: 'Bilet paneli kurulurken bir hata oluştu. Botun gerekli yetkilere sahip olduğundan emin olun.',
                        ephemeral: true
                    });
                }
                break;
            }

            case 'kelime_oyunu': {
                const channel = options.getChannel('kanal');
                if (data.kelimeOyunları[channel.id]) {
                    return await interaction.reply({
                        content: 'Bu kanalda zaten bir kelime oyunu devam ediyor!',
                        ephemeral: true
                    });
                }
                data.kelimeOyunları[channel.id] = {
                    lastWord: turkceKelimeler[Math.floor(Math.random() * turkceKelimeler.length)],
                    lastPlayer: null,
                    wordsUsed: [], // Yeni eklenen
                };
                saveData();
                await interaction.reply({
                    content: `Kelime oyunu <#${channel.id}> kanalında başladı! İlk kelime: **${data.kelimeOyunları[channel.id].lastWord}**`,
                    ephemeral: false
                });
                break;
            }

            case 'boom': {
                const channel = options.getChannel('kanal');
                if (data.boomOyunları[channel.id]) {
                    return await interaction.reply({
                        content: 'Bu kanalda zaten bir Boom oyunu devam ediyor!',
                        ephemeral: true
                    });
                }
                data.boomOyunları[channel.id] = {
                    sayı: 0
                };
                saveData();
                await interaction.reply({
                    content: `Boom oyunu <#${channel.id}> kanalında başladı! 1'den başlayarak saymaya başlayın.`,
                    ephemeral: false
                });
                break;
            }

            case 'oyun_bitir': {
                const channel = options.getChannel('kanal');
                if (data.kelimeOyunları[channel.id]) {
                    delete data.kelimeOyunları[channel.id];
                    saveData();
                    await interaction.reply({
                        content: `<#${channel.id}> kanalındaki kelime oyunu başarıyla bitirildi.`,
                        ephemeral: true
                    });
                } else if (data.boomOyunları[channel.id]) {
                    delete data.boomOyunları[channel.id];
                    saveData();
                    await interaction.reply({
                        content: `<#${channel.id}> kanalındaki Boom oyunu başarıyla bitirildi.`,
                        ephemeral: true
                    });
                } else {
                    await interaction.reply({
                        content: 'Bu kanalda devam eden bir oyun bulunamadı.',
                        ephemeral: true
                    });
                }
                break;
            }

            case 'sicil_sistem': {
                const kanal = options.getChannel('kanal');
                if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
                    return await interaction.reply({
                        content: 'Bu komutu kullanmak için `Üyeleri Yönet` yetkiniz olmalı.',
                        ephemeral: true
                    });
                }
                data.sicilSistemi.logsChannelId = kanal.id;
                saveData();
                await interaction.reply({
                    content: `Sicil sistemi log kanalı <#${kanal.id}> olarak ayarlandı.`,
                    ephemeral: true
                });
                break;
            }

            case 'sicil_kayıt': {
                const isim = options.getString('kişi');
                const ceza = options.getString('ceza');
                const sure = options.getString('süre');
                const sebep = options.getString('sebep');
                const logKanalId = data.sicilSistemi.logsChannelId;
                if (!logKanalId) {
                    return await interaction.reply({
                        content: 'Sicil log kanalı ayarlanmamış. Lütfen önce `/sicil_sistem` komutunu kullanın.',
                        ephemeral: true
                    });
                }

                if (!data.sicilSistemi.records[isim]) {
                    data.sicilSistemi.records[isim] = [];
                }
                const newRecord = {
                    ceza,
                    sure,
                    sebep,
                    timestamp: new Date().toISOString(),
                    moderator: interaction.user.tag
                };
                data.sicilSistemi.records[isim].push(newRecord);
                saveData();

                const logEmbed = new EmbedBuilder()
                    .setTitle('Yeni Sicil Kaydı')
                    .setDescription(`**${isim}** adlı kişinin siciline yeni bir kayıt eklendi.`)
                    .addFields({
                        name: 'Ceza Türü',
                        value: ceza,
                        inline: true
                    }, {
                        name: 'Süre',
                        value: sure,
                        inline: true
                    }, {
                        name: 'Sebep',
                        value: sebep,
                        inline: false
                    }, {
                        name: 'Moderator',
                        value: interaction.user.tag,
                        inline: true
                    })
                    .setColor('Red')
                    .setTimestamp();

                const logChannel = await interaction.guild.channels.fetch(logKanalId);
                if (logChannel) {
                    await logChannel.send({
                        embeds: [logEmbed]
                    });
                }
                await interaction.reply({
                    content: `**${isim}** için sicil kaydı başarıyla eklendi.`,
                    ephemeral: false
                });
                break;
            }

            case 'sicil_görüntüle': {
                const isim = options.getString('isim');
                const records = data.sicilSistemi.records[isim];
                if (!records || records.length === 0) {
                    return await interaction.reply({
                        content: `**${isim}** adına kayıtlı sicil bulunamadı.`,
                        ephemeral: true
                    });
                }
                const sicilEmbed = new EmbedBuilder()
                    .setTitle(`${isim} Sicil Kayıtları`)
                    .setColor('Blue');
                records.forEach((record, index) => {
                    sicilEmbed.addFields({
                        name: `Kayıt #${index + 1}`,
                        value: `**Ceza:** ${record.ceza}\n**Süre:** ${record.sure}\n**Sebep:** ${record.sebep}\n**Tarih:** <t:${Math.floor(new Date(record.timestamp).getTime() / 1000)}:F>\n**Kayıt eden:** ${record.moderator}`
                    });
                });
                await interaction.reply({
                    embeds: [sicilEmbed],
                    ephemeral: false
                });
                break;
            }

            case 'sicil_ceza_kaldır': {
                const isim = options.getString('isim');
                if (!data.sicilSistemi.records[isim]) {
                    return await interaction.reply({
                        content: `**${isim}** adına kayıtlı sicil bulunamadı.`,
                        ephemeral: true
                    });
                }
                delete data.sicilSistemi.records[isim];
                saveData();
                await interaction.reply({
                    content: `**${isim}** adlı kişinin tüm sicil kayıtları başarıyla silindi.`,
                    ephemeral: false
                });
                break;
            }

            case 'bot_koruma': {
                const durum = options.getString('durum');
                const bildirimKullanicisi = options.getUser('bildirim_kullanıcısı');
                const moderator = interaction.member;

                if (!moderator.permissions.has(PermissionsBitField.Flags.Administrator)) {
                    return await interaction.reply({
                        content: 'Bu komutu kullanmak için `Yönetici` yetkiniz olmalı.',
                        ephemeral: true
                    });
                }

                data.botKoruma.enabled = durum === 'aç';
                if (bildirimKullanicisi) {
                    data.botKoruma.notificationUserId = bildirimKullanicisi.id;
                }
                saveData();
                await interaction.reply({
                    content: `Bot koruma sistemi ${durum === 'aç' ? 'açıldı' : 'kapatıldı'}. ${bildirimKullanicisi ? `Bildirimler artık ${bildirimKullanicisi.tag} kullanıcısına gönderilecek.` : ''}`,
                    ephemeral: true
                });
                break;
            }

            case 'bot_izin': {
                const subcommand = options.getSubcommand();
                const botUser = options.getUser('bot');

                if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                    return await interaction.reply({
                        content: 'Bu komutu kullanmak için `Yönetici` yetkiniz olmalı.',
                        ephemeral: true
                    });
                }

                if (!botUser.bot) {
                    return await interaction.reply({
                        content: 'Lütfen bir botu etiketleyin.',
                        ephemeral: true
                    });
                }

                if (subcommand === 'ver') {
                    data.botKoruma.verifiedBots.add(botUser.id);
                    saveData();
                    await interaction.reply({
                        content: `${botUser.tag} adlı bota sunucuya girme izni verildi.`,
                        ephemeral: false
                    });
                } else if (subcommand === 'kaldır') {
                    if (data.botKoruma.verifiedBots.has(botUser.id)) {
                        data.botKoruma.verifiedBots.delete(botUser.id);
                        saveData();
                        await interaction.reply({
                            content: `${botUser.tag} adlı bottan sunucuya girme izni kaldırıldı.`,
                            ephemeral: false
                        });
                    } else {
                        await interaction.reply({
                            content: `${botUser.tag} adlı bot zaten izinli botlar listesinde değil.`,
                            ephemeral: true
                        });
                    }
                }
                break;
            }

            case 'bot_izin_verilenler': {
                const allowedBots = Array.from(data.botKoruma.verifiedBots);
                if (allowedBots.length === 0) {
                    return await interaction.reply({
                        content: 'Şu anda izin verilen bot bulunmamaktadır.',
                        ephemeral: true
                    });
                }
                const botNames = allowedBots.map(id => {
                    const bot = client.users.cache.get(id);
                    return bot ? bot.tag : `Bilinmeyen Bot (ID: ${id})`;
                });

                const embed = new EmbedBuilder()
                    .setTitle('İzin Verilen Botlar')
                    .setDescription(botNames.join('\n'))
                    .setColor('Green');

                await interaction.reply({
                    embeds: [embed],
                    ephemeral: false
                });
                break;
            }

            case 'tüm_sunuculardan_yasakla': {
                // YETKİ KONTROLÜ
                if (!checkPermission(PermissionFlagsBits.Administrator, () => hasModRole2)) {
                    return interaction.reply({
                        content: getNoPermissionMessage('Yönetici'),
                        ephemeral: true
                    });
                }

                const guildIds = [
                    '1418252804488822795',
                    '1410921098803154978',
                    '1420502952325546006',
                    '1410918173099688048',
                    '1408726426709917778',
                    '1413272276979286028',
                    '1408762448906944515',
                    '1412476726537224194',
                    '1418659132558545006',
                    '1350481389136511049',
                    '1342924261517692940',
                    '1249066524770304091',
                    '1342924933809963109',
                    '1355591106368245792',
                    '1260777159371391027',
                    '1342925452129603644',
                    '1207347993267671112',
                    '1268667835920421036',
                    '1345480000631214261',
                    '1345478998389555390',
                    '1207872456648560680',
                    '1355591106368245792',
                    '1355588514187710574',
                    '1212809930541764719',
                    '1355596646485856376',
                    '1342924818202493032'
                ];
                const kisi = options.getString('kişi');
                const sebep = options.getString('sebep');
                let userId = kisi;

                // Etiket veya ID kontrolü
                if (kisi.startsWith('<@') && kisi.endsWith('>')) {
                    userId = kisi.replace(/<@!?(\d+)>/, '$1');
                }

                if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator) && !isRestrictedGuild) {
                    return interaction.reply({
                        content: 'Bu komutu kullanmak için `Yönetici` yetkiniz olmalı.',
                        ephemeral: true
                    });
                }
                await interaction.deferReply({
                    ephemeral: false
                });

                const results = [];
                for (const guildId of guildIds) {
                    try {
                        const guild = await client.guilds.fetch(guildId);
                        await guild.bans.create(userId, {
                            reason: sebep
                        });
                        results.push(`✅ **${guild.name}** (${guild.id}) - Başarılı`);
                    } catch (error) {
                        if (error.code === 10004) { // Bilinmeyen Sunucu hatası
                            results.push(`❌ **${guildId}** - Sunucu bulunamadı.`);
                        } else if (error.code === 50013) { // Eksik Yetki hatası
                            results.push(`⚠️ **${guildId}** - Yetki hatası: Üyeleri yasaklama yetkim yok.`);
                        } else if (error.code === 50007) { // API Erişilemiyor hatası
                            results.push(`❌ **${guildId}** - API erişim hatası.`);
                        } else if (error.code === 10026) { // Bilinmeyen Ban hatası
                            results.push(`✅ **${guildId}** - Kişi zaten yasaklı.`);
                        } else {
                            console.error(`Sunucu ${guildId} için yasaklama hatası:`, error);
                            results.push(`❌ **${guildId}** - Bilinmeyen hata: ${error.message}`);
                        }
                    }
                }

                const embed = new EmbedBuilder()
                    .setTitle('Tüm Sunuculardan Yasaklama Raporu')
                    .setDescription(`**Kişi ID:** \`${userId}\`\n**Sebep:** \`${sebep}\`\n\n**Sonuçlar:**\n${results.join('\n')}`)
                    .setColor('Red');

                await interaction.editReply({
                    embeds: [embed]
                });
                break;
            }

            case 'tüm_sunucular_yasak-kaldır': {
                // YETKİ KONTROLÜ
                if (!checkPermission(PermissionFlagsBits.Administrator, () => hasModRole2)) {
                    return interaction.reply({
                        content: getNoPermissionMessage('Yönetici'),
                        ephemeral: true
                    });
                }

                const userId = options.getString('kişi_id');

                if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator) && !isRestrictedGuild) {
                    return interaction.reply({
                        content: 'Bu komutu kullanmak için `Yönetici` yetkiniz olmalı.',
                        ephemeral: true
                    });
                }
                await interaction.deferReply({
                    ephemeral: false
                });

                const guildIds = [
                    '1418252804488822795',
                    '1410921098803154978',
                    '1420502952325546006',
                    '1410918173099688048',
                    '1408726426709917778',
                    '1413272276979286028',
                    '1408762448906944515',
                    '1412476726537224194',
                    '1418659132558545006',
                    '1350481389136511049',
                    '1342924261517692940',
                    '1249066524770304091',
                    '1342924933809963109',
                    '1355591106368245792',
                    '1260777159371391027',
                    '1342925452129603644',
                    '1207347993267671112',
                    '1268667835920421036',
                    '1345480000631214261',
                    '1345478998389555390',
                    '1207872456648560680',
                    '1355591106368245792',
                    '1355588514187710574',
                    '1212809930541764719',
                    '1355596646485856376',
                    '1342924818202493032'
                ];
                const results = [];
                for (const guildId of guildIds) {
                    try {
                        const guild = await client.guilds.fetch(guildId);
                        await guild.bans.remove(userId);
                        results.push(`✅ **${guild.name}** (${guild.id}) - Başarılı`);
                    } catch (error) {
                        if (error.code === 10004) { // Bilinmeyen Sunucu hatası
                            results.push(`❌ **${guildId}** - Sunucu bulunamadı.`);
                        } else if (error.code === 50013) { // Eksik Yetki hatası
                            results.push(`⚠️ **${guildId}** - Yetki hatası: Üyelerin yasaklamasını kaldırma yetkim yok.`);
                        } else if (error.code === 50007) { // API Erişilemiyor hatası
                            results.push(`❌ **${guildId}** - API erişim hatası.`);
                        } else if (error.code === 10026) { // Bilinmeyen Ban hatası
                            results.push(`⚠️ **${guildId}** - Kişi yasaklı değil.`);
                        } else {
                            console.error(`Sunucu ${guildId} için yasak kaldırma hatası:`, error);
                            results.push(`❌ **${guildId}** - Bilinmeyen hata: ${error.message}`);
                        }
                    }
                }

                const embed = new EmbedBuilder()
                    .setTitle('Tüm Sunuculardan Yasak Kaldırma Raporu')
                    .setDescription(`**Kişi ID:** \`${userId}\`\n\n**Sonuçlar:**\n${results.join('\n')}`)
                    .setColor('Green');

                await interaction.editReply({
                    embeds: [embed]
                });
                break;
            }

            default:
                await interaction.reply({
                    content: 'Bu komut mevcut değil.',
                    ephemeral: true
                });
                break;
        }
    } else if (interaction.isButton()) {
        const {
            customId
        } = interaction;
        if (customId.startsWith('ticket_')) {
            // bilet sistemi butonları
            if (customId === 'ticket_kapat') {
                await interaction.reply({
                    content: 'Bileti kapatmak istediğinizden emin misiniz?',
                    components: [
                        new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                            .setCustomId('ticket_onay')
                            .setLabel('Onayla')
                            .setStyle(ButtonStyle.Danger),
                            new ButtonBuilder()
                            .setCustomId('ticket_iptal')
                            .setLabel('İptal')
                            .setStyle(ButtonStyle.Secondary)
                        )
                    ],
                    ephemeral: true
                });
            } else if (customId === 'ticket_onay') {
                const channelId = interaction.channel.id;
                const userTicketData = data.userTickets[channelId];
                if (userTicketData) {
                    const logChannelId = data.ticketData.logChannel;
                    if (logChannelId) {
                        const logChannel = await interaction.guild.channels.fetch(logChannelId);
                        if (logChannel) {
                            const closeEmbed = new EmbedBuilder()
                                .setTitle('Bilet Kapatıldı')
                                .setDescription(`Bilet #${userTicketData.ticketNumber} kapatıldı.`)
                                .addFields({
                                    name: 'Kapatan Yetkili',
                                    value: interaction.user.tag,
                                    inline: true
                                }, {
                                    name: 'Bilet Sahibi',
                                    value: `<@${userTicketData.userId}>`,
                                    inline: true
                                })
                                .setColor('Grey')
                                .setTimestamp();
                            await logChannel.send({
                                embeds: [closeEmbed]
                            });
                        }
                    }
                    await interaction.channel.delete();
                    delete data.userTickets[channelId];
                    saveData();
                } else {
                    await interaction.reply({
                        content: 'Bu bir bilet kanalı değil.',
                        ephemeral: true
                    });
                }
            } else if (customId === 'ticket_iptal') {
                await interaction.reply({
                    content: 'Bilet kapatma işlemi iptal edildi.',
                    ephemeral: true
                });
            }
        } else if (customId.startsWith('bot_')) {
            // bot koruma butonları
            const botId = customId.split('_')[2];
            const bot = client.users.cache.get(botId);
            if (!bot) {
                return await interaction.reply({
                    content: 'Bot bulunamadı.',
                    ephemeral: true
                });
            }
            if (customId.startsWith('bot_yasakla_')) {
                try {
                    await interaction.deferReply({
                        ephemeral: true
                    });
                    const guildMember = await interaction.guild.members.fetch(botId);
                    if (guildMember) {
                        await guildMember.ban({
                            reason: 'Bot koruma sistemi tarafından otomatik yasaklama.'
                        });
                        data.botKoruma.verifiedBots.delete(botId);
                        saveData();
                        await interaction.editReply({
                            content: `${bot.tag} adlı bot başarıyla sunucudan yasaklandı.`,
                            ephemeral: true
                        });
                        await interaction.message.edit({
                            components: []
                        }); // Butonları kaldır
                    } else {
                        // Bot zaten sunucuda değilse, sadece izin listesinden çıkar
                        if (data.botKoruma.verifiedBots.has(botId)) {
                            data.botKoruma.verifiedBots.delete(botId);
                            saveData();
                            await interaction.editReply({
                                content: `${bot.tag} adlı bot sunucuda bulunamadı ancak izin listesinden çıkarıldı.`,
                                ephemeral: true
                            });
                            await interaction.message.edit({
                                components: []
                            }); // Butonları kaldır
                        } else {
                            await interaction.editReply({
                                content: `${bot.tag} adlı bot sunucuda bulunamadı ve zaten yasaklı değildi.`,
                                ephemeral: true
                            });
                        }
                    }
                } catch (error) {
                    console.error(`Bot yasaklama işlemi sırasında hata: ${bot.tag}`, error);
                    await interaction.editReply({
                        content: `Botu yasaklarken bir hata oluştu. Botun gerekli yetkilere sahip olduğundan emin olun.`
                    });
                }
            } else if (customId.startsWith('bot_izin_ver_')) {
                try {
                    data.botKoruma.verifiedBots.add(botId);
                    saveData();
                    await interaction.reply({
                        content: `${bot.tag} adlı bota sunucuya girmesi için izin verildi.`,
                        ephemeral: true
                    });
                    await interaction.message.edit({
                        components: []
                    }); // Butonları kaldır
                } catch (error) {
                    console.error(`Bot izin verme işlemi sırasında hata: ${bot.tag}`, error);
                    await interaction.reply({
                        content: `Bota izin verirken bir hata oluştu.`
                    });
                }
            }
        }
    } else if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'ticket_select') {
            const selectedOption = interaction.values[0];
            const supportRoles = data.ticketData.supportRoles;
            const logChannelId = data.ticketData.logChannel;
            const categoryId = data.ticketData.category;
            const user = interaction.user;
            const guild = interaction.guild;
            const logChannel = await guild.channels.fetch(logChannelId);
            const kategori = await guild.channels.fetch(categoryId);
            const userExistingTicket = Object.values(data.userTickets).find(ticket => ticket.userId === user.id);
            if (userExistingTicket) {
                return await interaction.reply({
                    content: `Zaten açık bir biletiniz var: <#${userExistingTicket.channelId}>`,
                    ephemeral: true
                });
            }

            try {
                const ticketNumber = Object.keys(data.userTickets).length + 1;
                const permissionOverwrites = [{
                        id: guild.id,
                        deny: [PermissionFlagsBits.ViewChannel]
                    },
                    {
                        id: user.id,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
                    }
                ];

                let ticketType = '';
                let roleIdsToPing = [];
                switch (selectedOption) {
                    case 'server_support':
                        ticketType = 'sunucu-destek';
                        roleIdsToPing = supportRoles.server;
                        break;
                    case 'game_support':
                        ticketType = 'oyun-destek';
                        roleIdsToPing = supportRoles.game;
                        break;
                    case 'gamepass_support':
                        ticketType = 'gamepass-destek';
                        roleIdsToPing = supportRoles.gamepass;
                        break;
                }

                // İlgili rollere ViewChannel izni ekle
                if (roleIdsToPing.length > 0) {
                    roleIdsToPing.forEach(roleId => {
                        permissionOverwrites.push({
                            id: roleId,
                            allow: [PermissionFlagsBits.ViewChannel]
                        });
                    });
                }

                const newChannel = await guild.channels.create({
                    name: `${ticketType}-${ticketNumber}`,
                    type: ChannelType.GuildText,
                    parent: kategori,
                    permissionOverwrites: permissionOverwrites,
                });

                data.userTickets[newChannel.id] = {
                    userId: user.id,
                    ticketNumber: ticketNumber,
                    channelId: newChannel.id
                };
                saveData();

                const ticketEmbed = new EmbedBuilder()
                    .setTitle('Destek Bileti')
                    .setDescription('Bir yetkili en kısa sürede sizinle ilgilenecektir.')
                    .addFields({
                        name: 'Bilet Sahibi',
                        value: user.tag,
                        inline: true
                    }, {
                        name: 'Bilet Türü',
                        value: selectedOption.replace('_', ' '),
                        inline: true
                    })
                    .setColor('Green')
                    .setTimestamp();

                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                        .setCustomId('ticket_kapat')
                        .setLabel('Bileti Kapat')
                        .setStyle(ButtonStyle.Danger)
                    );

                await newChannel.send({
                    content: `${roleIdsToPing.map(roleId => `<@&${roleId}>`).join(' ')}`,
                    embeds: [ticketEmbed],
                    components: [row]
                });

                await interaction.reply({
                    content: `Biletiniz başarıyla açıldı: <#${newChannel.id}>`,
                    ephemeral: true
                });

                if (logChannel) {
                    const logEmbed = new EmbedBuilder()
                        .setTitle('Yeni Bilet Açıldı')
                        .setDescription(`Bilet #${ticketNumber} <#${newChannel.id}> kanalında açıldı.`)
                        .addFields({
                            name: 'Açan Kişi',
                            value: user.tag,
                            inline: true
                        }, {
                            name: 'Bilet Türü',
                            value: selectedOption.replace('_', ' '),
                            inline: true
                        })
                        .setColor('Blue')
                        .setTimestamp();
                    await logChannel.send({
                        embeds: [logEmbed]
                    });
                }
            } catch (error) {
                console.error('Bilet açma işlemi sırasında bir hata oluştu:', error);
                await interaction.reply({
                    content: 'Bilet açma sırasında bir hata oluştu.',
                    ephemeral: true
                });
            }
        }
    }
});

client.on('messageCreate', async message => {
    // Botun mesajlarına yanıt vermemesini sağlar ve mesajı küçük harfe çevirir.
    if (message.author.bot) return;

    // Kelime oyunu mantığı
    if (data.kelimeOyunları[message.channel.id]) {
        const oyunData = data.kelimeOyunları[message.channel.id];
        const lastWord = oyunData.lastWord.toLocaleLowerCase('tr-TR');
        const lastChar = lastWord[lastWord.length - 1];
        const player = message.author.id;

        // Ard arda yazma kontrolü
        if (player === oyunData.lastPlayer) {
            try {
                await message.delete();
            } catch (err) {
                if (err.code !== 10008) console.error(err);
            }
            return message.channel.send({
                content: `${message.author}, ard arda kelime yazamazsın!`,
                ephemeral: false
            }).then(msg => setTimeout(async () => {
                try {
                    await msg.delete();
                } catch (err) {
                    if (err.code !== 10008) console.error(err);
                }
            }, 5000));
        }

        const kelime = message.content.toLocaleLowerCase('tr-TR');
        const ilkHarf = kelime[0];

        if (kelime.startsWith(lastChar)) {
            if (!turkceKelimeler.includes(kelime)) {
                try {
                    await message.delete();
                } catch (err) {
                    if (err.code !== 10008) console.error(err);
                }
                return message.channel.send({
                    content: `${message.author}, yazdığın kelime sözlükte yok veya geçersiz!`,
                    ephemeral: false
                }).then(msg => setTimeout(async () => {
                    try {
                        await msg.delete();
                    } catch (err) {
                        if (err.code !== 10008) console.error(err);
                    }
                }, 5000));
            }
            if (oyunData.wordsUsed && oyunData.wordsUsed.includes(kelime)) {
                try {
                    await message.delete();
                } catch (err) {
                    if (err.code !== 10008) console.error(err);
                }
                return message.channel.send({
                    content: `${message.author}, bu kelime daha önce kullanıldı!`,
                    ephemeral: false
                }).then(msg => setTimeout(async () => {
                    try {
                        await msg.delete();
                    } catch (err) {
                        if (err.code !== 10008) console.error(err);
                    }
                }, 5000));
            }

            oyunData.lastWord = kelime;
            oyunData.lastPlayer = player;
            if (!oyunData.wordsUsed) {
                oyunData.wordsUsed = [];
            }
            oyunData.wordsUsed.push(kelime);
            saveData();
            await message.react('✅');
        } else {
            try {
                await message.delete();
            } catch (err) {
                if (err.code !== 10008) console.error(err);
            }
            await message.channel.send({
                content: `${message.author}, kelime **${lastChar}** harfi ile başlamalı!`,
                ephemeral: false
            }).then(msg => setTimeout(async () => {
                try {
                    await msg.delete();
                } catch (err) {
                    if (err.code !== 10008) console.error(err);
                }
            }, 5000));
        }
    }

    // Boom oyunu mantığı
    if (data.boomOyunları[message.channel.id]) {
        const oyunData = data.boomOyunları[message.channel.id];
        const kullaniciSayisi = parseInt(message.content);

        if (kullaniciSayisi !== oyunData.sayı + 1) {
            try {
                await message.delete();
            } catch (err) {
                if (err.code !== 10008) console.error(err);
            }
            return message.channel.send({
                content: `${message.author}, yanlış sayı girdin! Sıradaki sayı **${oyunData.sayı + 1}** idi. Kaybettin!`,
                ephemeral: false
            }).then(msg => setTimeout(async () => {
                try {
                    await msg.delete();
                } catch (err) {
                    if (err.code !== 10008) console.error(err);
                }
            }, 5000));
        }

        oyunData.sayı++;
        saveData();

        if (oyunData.sayı % BOOM_NUMBER === 0) {
            await message.channel.send(`**BOOM!** ${message.author} patladı!`);
            oyunData.sayı = 0; // Oyunu sıfırla
            saveData();
        }
    }

    // Otomatik moderasyon
    if (data.kufurEngeliAcik) {
        if (!data.engellenenKufurKanallari.has(message.channel.id) && !message.member.roles.cache.some(role => data.engellenenKufurRolleri.has(role.id))) {
            const lowerCaseContent = message.content.toLocaleLowerCase('tr-TR');
            const kufurBulundu = kufurler.some(kufur => lowerCaseContent.includes(kufur));
            if (kufurBulundu) {
                try {
                    await message.delete();
                } catch (err) {
                    if (err.code !== 10008) {
                        console.error('Küfür engeli: Mesaj silinirken hata:', err);
                    }
                }
                await message.channel.send({
                    content: `${message.author}, küfür etmemelisin!`,
                    ephemeral: false
                }).then(msg => setTimeout(async () => {
                    try {
                        await msg.delete();
                    } catch (err) {
                        if (err.code !== 10008) console.error(err);
                    }
                }, 5000));
            }
        }
    }

    if (data.linkEngeliAcik) {
        if (!data.engellenenLinkKanallari.has(message.channel.id) && !message.member.roles.cache.some(role => data.engellenenLinkRolleri.has(role.id))) {
            if (linkRegex.test(message.content)) {
                try {
                    await message.delete();
                } catch (err) {
                    if (err.code !== 10008) {
                        console.error('Link engeli: Mesaj silinirken hata:', err);
                    }
                }
                await message.channel.send({
                    content: `${message.author}, link paylaşımı yasak!`,
                    ephemeral: false
                }).then(msg => setTimeout(async () => {
                    try {
                        await msg.delete();
                    } catch (err) {
                        if (err.code !== 10008) console.error(err);
                    }
                }, 5000));
            }
        }
    }
});

client.on('guildMemberAdd', async member => {
    if (member.user.bot && data.botKoruma.enabled && !data.botKoruma.verifiedBots.has(member.user.id)) {
        try {
            // Botu sunucudan at
            await member.kick('Bot koruma sistemi: Yetkisiz bot girişi.');
            console.log(`${member.user.tag} adlı bot, yetkisiz olduğu için atıldı.`);
            // Bildirim gönder
            const notificationUser = await client.users.fetch(data.botKoruma.notificationUserId);
            if (notificationUser) {
                const embed = new EmbedBuilder()
                    .setTitle('Yetkisiz Bot Girişi Algılandı')
                    .setDescription(`Sunucuya yetkisiz bir bot eklendi ve sistem tarafından atıldı.`)
                    .addFields({
                        name: 'Bot Adı',
                        value: member.user.tag,
                        inline: true
                    }, {
                        name: 'Bot ID',
                        value: member.user.id,
                        inline: true
                    })
                    .setColor('Red')
                    .setTimestamp();
                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                        .setCustomId(`bot_izin_ver_${member.user.id}`)
                        .setLabel('Bota İzin Ver')
                        .setStyle(ButtonStyle.Success),
                        new ButtonBuilder()
                        .setCustomId(`bot_yasakla_${member.user.id}`)
                        .setLabel('Botu Yasakla')
                        .setStyle(ButtonStyle.Danger)
                    );
                await notificationUser.send({
                    embeds: [embed],
                    components: [row]
                });
            }
        } catch (error) {
            console.error('Bot koruma işlemi sırasında hata oluştu:', error);
        }
    }
});

client.on('guildMemberRemove', async member => {
    if (member.user.bot) {
        if (data.botKoruma.verifiedBots.has(member.user.id)) {
            data.botKoruma.verifiedBots.delete(member.user.id);
            saveData();
            console.log(`${member.user.tag} adlı bot sunucudan ayrıldığı için izin listesinden çıkarıldı.`);
        }
    }
});

client.login(token);